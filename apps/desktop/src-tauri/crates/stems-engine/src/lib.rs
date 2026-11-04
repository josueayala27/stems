//! Audio engine: clock, transport, mixing and streaming (docs/architecture/02-audio-engine.md).
//!
//! Threads:
//! - the real-time thread runs [`Mixer::process`]. It never allocates, locks or does I/O;
//! - one disk thread per song decodes ahead of the play head ([`stream`]);
//! - the control thread owns the device and the [`Engine`] handle ([`host`]).
//!
//! Commands reach the mixer through an SPSC queue and carry a target sample on the engine
//! clock. State leaves through a triple buffer.

pub mod click;
pub mod command;
pub mod decode;
pub mod device;
pub mod engine;
mod error;
pub mod guide;
pub mod host;
pub mod meter;
pub mod mixer;
pub mod pad;
mod ramp;
pub mod routing;
pub mod sampler;
pub mod song;
pub mod source;
pub mod state;
pub mod stream;
pub mod tempo;

pub use command::{At, Command, LiveAction, Scheduled, Transition, TransitionKind, Transport};
pub use engine::{Engine, SongInfo, TrackInfo};
pub use error::{EngineError, Result};
pub use mixer::{Garbage, Mixer};
pub use song::{Song, TrackRole};
pub use ramp::{Ramp, RAMP_FRAMES};
pub use routing::{BusDoc, Routing, RoutingDoc, MAX_BUSES};
pub use source::Source;
pub use state::{ArmedKind, EngineState, StateEvent};
pub use tempo::Quantize;

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
