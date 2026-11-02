use serde::Serialize;

use crate::MAX_TRACKS;

/// What the real-time thread publishes after every callback. Fixed size, so publishing never
/// allocates.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EngineState {
    pub sample_rate: u32,
    /// Frames rendered since the mixer started. Scheduled commands use this clock.
    pub clock: u64,
    /// Play head in song frames.
    pub position: u64,
    /// Song length in frames, 0 with no song.
    pub length: u64,
    pub loaded: bool,
    pub playing: bool,
    /// Device callbacks that arrived late.
    pub xruns: u64,
    /// Track reads that found no streamed data ready.
    pub underruns: u64,
    /// Commands left in the queue because the schedule was full.
    pub deferred_commands: u64,
    /// Callback time over buffer time, 0–1+.
    pub cpu_load: f32,
    pub track_count: usize,
    /// Peak per track with a 300 ms release, linear.
    pub meters: [f32; MAX_TRACKS],
    pub master: [f32; 2],
}

impl EngineState {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            clock: 0,
            position: 0,
            length: 0,
            loaded: false,
            playing: false,
            xruns: 0,
            underruns: 0,
            deferred_commands: 0,
            cpu_load: 0.0,
            track_count: 0,
            meters: [0.0; MAX_TRACKS],
            master: [0.0; 2],
        }
    }
}

/// The `engine://state` event payload.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateEvent {
    pub sample_rate: u32,
    pub clock: u64,
    pub position: u64,
    pub length: u64,
    pub loaded: bool,
    pub playing: bool,
    pub xruns: u64,
    pub underruns: u64,
    pub cpu_load: f32,
    pub meters: Vec<f32>,
    pub master: [f32; 2],
}

impl From<&EngineState> for StateEvent {
    fn from(state: &EngineState) -> Self {
        Self {
            sample_rate: state.sample_rate,
            clock: state.clock,
            position: state.position,
            length: state.length,
            loaded: state.loaded,
            playing: state.playing,
            xruns: state.xruns,
            underruns: state.underruns,
            cpu_load: state.cpu_load,
            meters: state.meters[..state.track_count.min(MAX_TRACKS)].to_vec(),
            master: state.master,
        }
    }
}
