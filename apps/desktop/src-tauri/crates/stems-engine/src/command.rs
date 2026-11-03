use serde::Deserialize;

use crate::pad::Pad;
use crate::song::Song;
use crate::source::Source;
use crate::tempo::Quantize;

/// When a command takes effect on the engine clock.
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

/// A live action, armed for a quantized point on the song timeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LiveAction {
    /// Jump to this song frame.
    Jump { to: u64 },
    /// Loop the section under the play head until released.
    Vamp,
    /// Stop.
    Stop,
    /// End the song and run the setlist transition.
    EndSong,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TransitionKind {
    #[default]
    Stop,
    /// Start the next song after the pre-wait.
    Auto,
    /// Start the next song under the end of this one.
    Crossfade,
}

/// How the current song hands over to the next, in device frames.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Transition {
    pub kind: TransitionKind,
    pub pre_wait: u64,
    pub crossfade: u64,
}

/// A command for the real-time thread.
#[derive(Debug)]
pub enum Command {
    Play,
    /// Play from the top with the song's count-in, if it has one.
    PlayWithCountIn,
    Stop,
    /// Move the play head to this song frame (with a short crossfade while playing).
    Seek(u64),
    Gain { track: usize, gain: f32 },
    Mute { track: usize, muted: bool },
    Solo { track: usize, soloed: bool },
    /// Arm an action for the next quantize boundary. Replaces any armed action.
    Arm { action: LiveAction, quantize: Quantize },
    CancelArmed,
    /// Stop vamping: play on through the end of the section.
    ReleaseVamp,
    /// Replace the current song. The old one goes back to the control thread to be dropped.
    LoadSong(Box<Song>),
    UnloadSong,
    /// Preload the song that follows, and how to get there.
    PrepareNext { song: Box<Song>, transition: Transition },
    ClearNext,
    /// Make the prepared song current now.
    Advance { play: bool },
    /// Swap a track's source (click and guide are rebuilt when options change).
    SetSource { track: usize, source: Source },
    /// Crossfade to another pad, or out with `None`.
    SetPad(Option<Box<Pad>>),
    PadGain(f32),
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
    PlayWithCountIn,
    Stop,
    Seek { position: u64 },
    Gain { track: usize, gain: f32 },
    Mute { track: usize, muted: bool },
    Solo { track: usize, soloed: bool },
    Arm { action: LiveAction, quantize: Quantize },
    CancelArmed,
    ReleaseVamp,
    Advance { play: bool },
    PadGain { gain: f32 },
}

impl From<Transport> for Command {
    fn from(transport: Transport) -> Self {
        match transport {
            Transport::Play => Self::Play,
            Transport::PlayWithCountIn => Self::PlayWithCountIn,
            Transport::Stop => Self::Stop,
            Transport::Seek { position } => Self::Seek(position),
            Transport::Gain { track, gain } => Self::Gain { track, gain },
            Transport::Mute { track, muted } => Self::Mute { track, muted },
            Transport::Solo { track, soloed } => Self::Solo { track, soloed },
            Transport::Arm { action, quantize } => Self::Arm { action, quantize },
            Transport::CancelArmed => Self::CancelArmed,
            Transport::ReleaseVamp => Self::ReleaseVamp,
            Transport::Advance { play } => Self::Advance { play },
            Transport::PadGain { gain } => Self::PadGain(gain),
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
        let arm: Transport =
            serde_json::from_str(r#"{"type":"arm","action":{"type":"jump","to":96000},"quantize":"bar"}"#).unwrap();
        assert_eq!(arm, Transport::Arm { action: LiveAction::Jump { to: 96_000 }, quantize: Quantize::Bar });
    }
}
