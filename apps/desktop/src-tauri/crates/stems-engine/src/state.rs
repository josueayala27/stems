use serde::Serialize;

use crate::routing::MAX_BUSES;
use crate::MAX_TRACKS;

/// What an armed action will do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ArmedKind {
    #[default]
    None,
    Jump,
    Vamp,
    Stop,
    EndSong,
}

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
    /// Tag of the current song (set by the control thread), 0 with none.
    pub song_tag: u64,
    /// Tag of the prepared next song, 0 with none.
    pub next_tag: u64,
    pub armed: ArmedKind,
    /// Song frame where the armed action lands.
    pub armed_at: u64,
    /// Jump target of an armed jump.
    pub armed_to: u64,
    pub vamping: bool,
    pub vamp_start: u64,
    pub vamp_end: u64,
    /// Count-in frames left, 0 when not counting in.
    pub count_in: u64,
    /// Pre-wait frames left before an auto-advance, 0 when not waiting.
    pub waiting: u64,
    /// The previous song is still fading out under this one.
    pub crossfading: bool,
    pub pad: bool,
    /// Device callbacks that arrived late.
    pub xruns: u64,
    /// Track reads that found no streamed data ready.
    pub underruns: u64,
    /// Commands left in the queue because the schedule was full.
    pub deferred_commands: u64,
    /// Callback time over buffer time, 0–1+.
    pub cpu_load: f32,
    pub track_count: usize,
    /// Peak per track with a 300 ms release, linear, after the track fader.
    pub meters: [f32; MAX_TRACKS],
    /// RMS per track over a 300 ms average, linear.
    pub rms: [f32; MAX_TRACKS],
    pub bus_count: usize,
    /// Peak and RMS per bus, after the bus fader (`meter.rs`).
    pub bus_meters: [f32; MAX_BUSES],
    pub bus_rms: [f32; MAX_BUSES],
    /// Bus each track plays into, after the role fallback. 255: none (timecode with no bus).
    pub track_buses: [u8; MAX_TRACKS],
    /// Output channels of the device the mixer last rendered to.
    pub device_channels: usize,
    /// Loudest left and right of any bus, with a 300 ms release.
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
            song_tag: 0,
            next_tag: 0,
            armed: ArmedKind::None,
            armed_at: 0,
            armed_to: 0,
            vamping: false,
            vamp_start: 0,
            vamp_end: 0,
            count_in: 0,
            waiting: 0,
            crossfading: false,
            pad: false,
            xruns: 0,
            underruns: 0,
            deferred_commands: 0,
            cpu_load: 0.0,
            track_count: 0,
            meters: [0.0; MAX_TRACKS],
            rms: [0.0; MAX_TRACKS],
            bus_count: 0,
            bus_meters: [0.0; MAX_BUSES],
            bus_rms: [0.0; MAX_BUSES],
            track_buses: [0; MAX_TRACKS],
            device_channels: 0,
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
    pub song_tag: u64,
    pub next_tag: u64,
    pub armed: ArmedKind,
    pub armed_at: u64,
    pub armed_to: u64,
    pub vamping: bool,
    pub vamp_start: u64,
    pub vamp_end: u64,
    pub count_in: u64,
    pub waiting: u64,
    pub crossfading: bool,
    pub pad: bool,
    pub xruns: u64,
    pub underruns: u64,
    pub cpu_load: f32,
    pub meters: Vec<f32>,
    pub rms: Vec<f32>,
    pub bus_meters: Vec<f32>,
    pub bus_rms: Vec<f32>,
    pub track_buses: Vec<u8>,
    pub device_channels: usize,
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
            song_tag: state.song_tag,
            next_tag: state.next_tag,
            armed: state.armed,
            armed_at: state.armed_at,
            armed_to: state.armed_to,
            vamping: state.vamping,
            vamp_start: state.vamp_start,
            vamp_end: state.vamp_end,
            count_in: state.count_in,
            waiting: state.waiting,
            crossfading: state.crossfading,
            pad: state.pad,
            xruns: state.xruns,
            underruns: state.underruns,
            cpu_load: state.cpu_load,
            meters: state.meters[..state.track_count.min(MAX_TRACKS)].to_vec(),
            rms: state.rms[..state.track_count.min(MAX_TRACKS)].to_vec(),
            bus_meters: state.bus_meters[..state.bus_count.min(MAX_BUSES)].to_vec(),
            bus_rms: state.bus_rms[..state.bus_count.min(MAX_BUSES)].to_vec(),
            track_buses: state.track_buses[..state.track_count.min(MAX_TRACKS)].to_vec(),
            device_channels: state.device_channels,
            master: state.master,
        }
    }
}
