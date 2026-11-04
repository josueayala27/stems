//! Show control: MIDI in and out, LTC and MTC, Ableton Link (docs/architecture/05-control-sync.md).
//! Events are scheduled on the engine clock, never on a UI timer.

pub mod ltc;
pub mod midi;
pub mod timecode;

pub use ltc::LtcGenerator;
pub use midi::{MidiAction, MidiMessage};
pub use timecode::{FrameRate, Timecode, TimecodeError};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
