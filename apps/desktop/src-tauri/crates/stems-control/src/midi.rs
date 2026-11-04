//! MIDI out: the messages song cue events send, and output ports through `midir` (CoreMIDI on
//! macOS). Messages are fixed size, so the real-time thread can queue them without allocating.

use serde::{Deserialize, Serialize};

/// One short MIDI message (at most three bytes).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MidiMessage {
    bytes: [u8; 3],
    len: u8,
}

impl MidiMessage {
    fn new(bytes: &[u8]) -> Self {
        let mut message = Self { bytes: [0; 3], len: bytes.len().min(3) as u8 };
        message.bytes[..message.len as usize].copy_from_slice(&bytes[..message.len as usize]);
        message
    }

    fn status(kind: u8, channel: u8) -> u8 {
        kind | (channel.clamp(1, 16) - 1)
    }

    /// Program change on a 1-based channel; `program` is 0–127.
    pub fn program_change(channel: u8, program: u8) -> Self {
        Self::new(&[Self::status(0xC0, channel), program & 0x7F])
    }

    pub fn note_on(channel: u8, note: u8, velocity: u8) -> Self {
        Self::new(&[Self::status(0x90, channel), note & 0x7F, velocity & 0x7F])
    }

    pub fn note_off(channel: u8, note: u8) -> Self {
        Self::new(&[Self::status(0x80, channel), note & 0x7F, 0])
    }

    pub fn control_change(channel: u8, controller: u8, value: u8) -> Self {
        Self::new(&[Self::status(0xB0, channel), controller & 0x7F, value & 0x7F])
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes[..usize::from(self.len)]
    }
}

/// A cue event's MIDI action, as `@stems/schema` `CueAction` stores it. Channels are 1–16.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MidiAction {
    MidiProgram { channel: u8, program: u8 },
    /// A trigger: note on, then note off right after it.
    MidiNote { channel: u8, note: u8, velocity: u8 },
    MidiCc { channel: u8, controller: u8, value: u8 },
}

impl MidiAction {
    /// The messages this action sends, in order (one or two).
    pub fn messages(self) -> [Option<MidiMessage>; 2] {
        match self {
            Self::MidiProgram { channel, program } => [Some(MidiMessage::program_change(channel, program)), None],
            Self::MidiNote { channel, note, velocity } => {
                [Some(MidiMessage::note_on(channel, note, velocity)), Some(MidiMessage::note_off(channel, note))]
            }
            Self::MidiCc { channel, controller, value } => [Some(MidiMessage::control_change(channel, controller, value)), None],
        }
    }
}

/// The virtual source Stems publishes on macOS, so apps on the same Mac (Lumen, a DAW) can listen.
pub const VIRTUAL_PORT: &str = "Stems";

#[derive(Debug)]
pub struct MidiError(pub String);

impl std::fmt::Display for MidiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "MIDI error: {}", self.0)
    }
}

impl std::error::Error for MidiError {}

fn error(cause: impl std::fmt::Display) -> MidiError {
    MidiError(cause.to_string())
}

/// Names of the MIDI output ports, plus the virtual `Stems` source where the OS supports it.
pub fn output_ports() -> Result<Vec<String>, MidiError> {
    let output = midir::MidiOutput::new("Stems").map_err(error)?;
    let mut names: Vec<String> = output.ports().iter().filter_map(|port| output.port_name(port).ok()).collect();
    if cfg!(unix) && !names.iter().any(|name| name == VIRTUAL_PORT) {
        names.insert(0, VIRTUAL_PORT.to_string());
    }
    Ok(names)
}

/// An open MIDI output.
pub struct MidiOut {
    connection: midir::MidiOutputConnection,
    pub name: String,
}

impl MidiOut {
    /// Open the port named `name`, or create the virtual `Stems` source.
    pub fn connect(name: &str) -> Result<Self, MidiError> {
        let output = midir::MidiOutput::new("Stems").map_err(error)?;
        #[cfg(unix)]
        if name == VIRTUAL_PORT {
            use midir::os::unix::VirtualOutput;
            let connection = output.create_virtual(VIRTUAL_PORT).map_err(error)?;
            return Ok(Self { connection, name: name.to_string() });
        }
        let port = output
            .ports()
            .into_iter()
            .find(|port| output.port_name(port).is_ok_and(|port_name| port_name == name))
            .ok_or_else(|| MidiError(format!("MIDI port {name} not found")))?;
        let connection = output.connect(&port, "Stems out").map_err(error)?;
        Ok(Self { connection, name: name.to_string() })
    }

    pub fn send(&mut self, message: &MidiMessage) -> Result<(), MidiError> {
        self.connection.send(message.bytes()).map_err(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_encode_status_and_data() {
        assert_eq!(MidiMessage::program_change(1, 12).bytes(), [0xC0, 12]);
        assert_eq!(MidiMessage::program_change(16, 127).bytes(), [0xCF, 127]);
        assert_eq!(MidiMessage::note_on(10, 36, 100).bytes(), [0x99, 36, 100]);
        assert_eq!(MidiMessage::note_off(10, 36).bytes(), [0x89, 36, 0]);
        assert_eq!(MidiMessage::control_change(2, 7, 200).bytes(), [0xB1, 7, 200 & 0x7F]);
    }

    #[test]
    fn actions_parse_the_schema_shape_and_ignore_the_port() {
        let program: MidiAction = serde_json::from_str(r#"{"kind":"midiProgram","port":"","channel":3,"program":5}"#).unwrap();
        assert_eq!(program.messages(), [Some(MidiMessage::program_change(3, 5)), None]);
        let note: MidiAction = serde_json::from_str(r#"{"kind":"midiNote","port":"","channel":1,"note":60,"velocity":90}"#).unwrap();
        assert_eq!(note.messages(), [Some(MidiMessage::note_on(1, 60, 90)), Some(MidiMessage::note_off(1, 60))]);
        let cc: MidiAction = serde_json::from_str(r#"{"kind":"midiCc","port":"x","channel":1,"controller":64,"value":127}"#).unwrap();
        assert_eq!(cc.messages()[0].unwrap().bytes(), [0xB0, 64, 127]);
    }
}
