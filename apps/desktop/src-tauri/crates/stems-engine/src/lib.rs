//! Audio engine: clock, transport, mixing and streaming (docs/architecture/02-audio-engine.md).
//!
//! Threads:
//! - the real-time thread runs [`Mixer::process`]. It never allocates, locks or does I/O;
//! - one disk thread per song decodes ahead of the play head ([`stream`]);
//! - the control thread owns the device and the [`Engine`] handle ([`host`]).
//!
//! Commands reach the mixer through an SPSC queue and carry a target sample on the engine
//! clock. State leaves through a triple buffer.

pub mod command;
pub mod decode;
pub mod device;
pub mod engine;
mod error;
pub mod host;
pub mod mixer;
mod ramp;
pub mod source;
pub mod state;
pub mod stream;

pub use command::{At, Command, Scheduled, Transport};
pub use engine::{Engine, SongInfo, TrackInfo};
pub use error::{EngineError, Result};
pub use mixer::{Mixer, Song};
pub use ramp::{Ramp, RAMP_FRAMES};
pub use source::Source;
pub use state::{EngineState, StateEvent};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Tracks per song the mixer accepts. Fixed so the real-time state has no heap.
pub const MAX_TRACKS: usize = 64;
/// Frames mixed in one pass. Larger device buffers are split into passes of this size.
pub const MAX_BLOCK: usize = 4096;
/// Every track is stereo inside the engine. Mono files are copied to both sides.
pub const CHANNELS: usize = 2;

// Real-time tests abort on any allocation inside `assert_no_alloc` blocks.
#[cfg(test)]
#[global_allocator]
static ALLOCATOR: assert_no_alloc::AllocDisabler = assert_no_alloc::AllocDisabler;

/// Quantize target for a transport command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quantize {
    Now,
    Beat,
    Bar,
}

/// The first sample at or after `position` (strictly after, unless `Now`) on a grid of `step` samples.
/// Matches `nextQuantizeBoundary` in `@stems/core` for a constant tempo.
pub fn next_boundary(position: u64, step: u64, target: Quantize) -> u64 {
    match target {
        Quantize::Now => position,
        Quantize::Beat | Quantize::Bar if step == 0 => position,
        Quantize::Beat | Quantize::Bar => (position / step + 1) * step,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_boundary_moves_to_the_next_grid_line() {
        // 120 bpm at 48 kHz: one beat is 24 000 samples, one 4/4 bar 96 000.
        assert_eq!(next_boundary(1_000, 24_000, Quantize::Beat), 24_000);
        assert_eq!(next_boundary(24_000, 24_000, Quantize::Beat), 48_000);
        assert_eq!(next_boundary(1_000, 96_000, Quantize::Bar), 96_000);
        assert_eq!(next_boundary(1_000, 96_000, Quantize::Now), 1_000);
    }
}
