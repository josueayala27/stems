use serde::Deserialize;

use crate::mixer::Song;

/// When a command takes effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum At {
    /// At the start of the next block the mixer renders.
    Now,
    /// At this frame of the engine clock (frames rendered since the mixer started). The mixer
    /// splits its block here, so the command lands on this exact sample. A time in the past
    /// applies at once.
    Clock(u64),
}

impl At {
    pub(crate) fn frame(self) -> u64 {
        match self {
            Self::Now => 0,
            Self::Clock(frame) => frame,
        }
    }
}

/// A command for the real-time thread.
#[derive(Debug)]
pub enum Command {
    Play,
    Stop,
    /// Move the play head to this song frame.
    Seek(u64),
    Gain { track: usize, gain: f32 },
    Mute { track: usize, muted: bool },
    Solo { track: usize, soloed: bool },
    /// Replace the current song. The old one goes back to the control thread to be dropped.
    LoadSong(Box<Song>),
    UnloadSong,
}

#[derive(Debug)]
pub struct Scheduled {
    pub at: At,
    pub command: Command,
}

/// Transport commands from the UI (`engine_command`).
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Transport {
    Play,
    Stop,
    Seek { position: u64 },
    Gain { track: usize, gain: f32 },
    Mute { track: usize, muted: bool },
    Solo { track: usize, soloed: bool },
}

impl From<Transport> for Command {
    fn from(transport: Transport) -> Self {
        match transport {
            Transport::Play => Self::Play,
            Transport::Stop => Self::Stop,
            Transport::Seek { position } => Self::Seek(position),
            Transport::Gain { track, gain } => Self::Gain { track, gain },
            Transport::Mute { track, muted } => Self::Mute { track, muted },
            Transport::Solo { track, soloed } => Self::Solo { track, soloed },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_parses_the_ui_shape() {
        let seek: Transport = serde_json::from_str(r#"{"type":"seek","position":48000}"#).unwrap();
        assert_eq!(seek, Transport::Seek { position: 48_000 });
        let solo: Transport = serde_json::from_str(r#"{"type":"solo","track":2,"soloed":true}"#).unwrap();
        assert_eq!(solo, Transport::Solo { track: 2, soloed: true });
    }
}
