//! The real-time core. Everything reachable from [`Mixer::process`] is allocation free, lock free
//! and does no I/O. `assert_no_alloc` checks this in the tests.

use crate::command::{At, Command, Scheduled};
use crate::ramp::Ramp;
use crate::source::Source;
use crate::state::EngineState;
use crate::{EngineError, CHANNELS, MAX_BLOCK, MAX_TRACKS};

/// Commands held by the mixer waiting for their target sample.
pub const SCHEDULE_CAPACITY: usize = 256;
/// Meter release time.
const METER_RELEASE_SECONDS: f32 = 0.3;

#[derive(Debug)]
pub struct Track {
    source: Source,
    gain: f32,
    muted: bool,
    soloed: bool,
    ramp: Ramp,
    /// Peak since the last publish.
    peak: f32,
    meter: f32,
}

impl Track {
    fn new(source: Source) -> Self {
        Self { source, gain: 1.0, muted: false, soloed: false, ramp: Ramp::new(1.0), peak: 0.0, meter: 0.0 }
    }

    fn target(&self, any_solo: bool) -> f32 {
        let audible = !self.muted && (!any_solo || self.soloed);
        if audible {
            self.gain
        } else {
            0.0
        }
    }
}

/// A loaded song: its tracks, built on the control thread and handed to the mixer.
#[derive(Debug)]
pub struct Song {
    tracks: Vec<Track>,
    length: u64,
}

impl Song {
    pub fn new(sources: Vec<Source>) -> crate::Result<Self> {
        if sources.len() > MAX_TRACKS {
            return Err(EngineError::TooManyTracks(sources.len()));
        }
        let length = sources.iter().map(Source::frames).max().unwrap_or(0);
        Ok(Self { tracks: sources.into_iter().map(Track::new).collect(), length })
    }

    pub fn length(&self) -> u64 {
        self.length
    }

    pub fn track_count(&self) -> usize {
        self.tracks.len()
    }
}

pub struct Mixer {
    sample_rate: u32,
    commands: rtrb::Consumer<Scheduled>,
    garbage: rtrb::Producer<Box<Song>>,
    state: triple_buffer::Input<EngineState>,
    schedule: Vec<Scheduled>,
    song: Option<Box<Song>>,
    clock: u64,
    position: u64,
    playing: bool,
    scratch: Box<[f32]>,
    mix: Box<[f32]>,
    xruns: u64,
    underruns: u64,
    deferred: u64,
    cpu_load: f32,
    master_peak: [f32; 2],
    master: [f32; 2],
    frames_since_publish: usize,
}

impl Mixer {
    pub(crate) fn new(
        sample_rate: u32,
        commands: rtrb::Consumer<Scheduled>,
        garbage: rtrb::Producer<Box<Song>>,
        state: triple_buffer::Input<EngineState>,
    ) -> Self {
        Self {
            sample_rate,
            commands,
            garbage,
            state,
            schedule: Vec::with_capacity(SCHEDULE_CAPACITY),
            song: None,
            clock: 0,
            position: 0,
            playing: false,
            scratch: vec![0.0; MAX_BLOCK * CHANNELS].into_boxed_slice(),
            mix: vec![0.0; MAX_BLOCK * CHANNELS].into_boxed_slice(),
            xruns: 0,
            underruns: 0,
            deferred: 0,
            cpu_load: 0.0,
            master_peak: [0.0; 2],
            master: [0.0; 2],
            frames_since_publish: 0,
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// The device callback: mix into `out`, interleaved with `channels` channels. The stereo mix
    /// goes to the first two channels (summed for a mono device); routing arrives in M4.
    pub fn process(&mut self, out: &mut [f32], channels: usize) {
        let channels = channels.max(1);
        let frames = out.len() / channels;
        let mut done = 0;
        while done < frames {
            let count = (frames - done).min(MAX_BLOCK);
            self.process_block(count);
            let destination = &mut out[done * channels..(done + count) * channels];
            for (frame, mixed) in destination.chunks_exact_mut(channels).zip(self.mix.chunks_exact(CHANNELS)) {
                if channels == 1 {
                    frame[0] = 0.5 * (mixed[0] + mixed[1]);
                } else {
                    frame[0] = mixed[0];
                    frame[1] = mixed[1];
                    frame[2..].fill(0.0);
                }
            }
            done += count;
        }
        out[frames * channels..].fill(0.0);
        self.publish(frames);
    }

    /// Offline render with no device: `frames` stereo frames, through the same code as `process`.
    pub fn render(&mut self, frames: usize) -> Vec<f32> {
        let mut out = vec![0.0; frames * CHANNELS];
        self.process(&mut out, CHANNELS);
        out
    }

    /// The device layer reports a late callback.
    pub fn report_xrun(&mut self) {
        self.xruns += 1;
    }

    /// The device layer reports the last callback's time over its buffer time.
    pub fn set_cpu_load(&mut self, load: f32) {
        self.cpu_load = load;
    }

    fn take_commands(&mut self) {
        while self.schedule.len() < SCHEDULE_CAPACITY {
            match self.commands.pop() {
                Ok(command) => self.schedule.push(command),
                Err(_) => return,
            }
        }
        if !self.commands.is_empty() {
            self.deferred += 1;
        }
    }

    /// Index of the earliest command due at or before `frame`, first in arrival order on ties.
    fn next_due(&self, frame: u64) -> Option<usize> {
        let mut best: Option<(usize, u64)> = None;
        for (index, scheduled) in self.schedule.iter().enumerate() {
            let at = scheduled.at.frame();
            if at <= frame && best.is_none_or(|(_, earliest)| at < earliest) {
                best = Some((index, at));
            }
        }
        best.map(|(index, _)| index)
    }

    fn process_block(&mut self, frames: usize) {
        self.take_commands();
        let start = self.clock;
        let end = start + frames as u64;
        let mut cursor = 0;
        loop {
            while let Some(index) = self.next_due(self.clock) {
                // `remove` keeps arrival order and only shifts within capacity: no allocation.
                let scheduled = self.schedule.remove(index);
                self.apply(scheduled.command);
            }
            let split = self
                .schedule
                .iter()
                .filter_map(|scheduled| match scheduled.at {
                    At::Clock(frame) if frame < end => Some(frame),
                    _ => None,
                })
                .min();
            let until = split.map_or(frames, |frame| (frame - start) as usize);
            if until > cursor {
                self.render_segment(cursor, until);
            }
            cursor = until;
            if cursor >= frames {
                break;
            }
        }
    }

    fn apply(&mut self, command: Command) {
        match command {
            Command::Play => {
                if let Some(song) = self.song.as_deref_mut() {
                    if self.position >= song.length {
                        self.position = 0;
                        song.tracks.iter_mut().for_each(|track| track.source.seek(0));
                    }
                    self.playing = song.length > 0;
                }
            }
            Command::Stop => self.playing = false,
            Command::Seek(position) => {
                if let Some(song) = self.song.as_deref_mut() {
                    self.position = position.min(song.length);
                    let position = self.position;
                    song.tracks.iter_mut().for_each(|track| track.source.seek(position));
                }
            }
            Command::Gain { track, gain } => {
                if let Some(track) = self.track_mut(track) {
                    track.gain = if gain.is_finite() { gain.max(0.0) } else { 0.0 };
                }
            }
            Command::Mute { track, muted } => {
                if let Some(track) = self.track_mut(track) {
                    track.muted = muted;
                }
            }
            Command::Solo { track, soloed } => {
                if let Some(track) = self.track_mut(track) {
                    track.soloed = soloed;
                }
            }
            Command::LoadSong(song) => {
                let old = self.song.replace(song);
                self.position = 0;
                self.playing = false;
                self.retire(old);
            }
            Command::UnloadSong => {
                let old = self.song.take();
                self.position = 0;
                self.playing = false;
                self.retire(old);
            }
        }
    }

    /// Send a replaced song back to the control thread, which frees it.
    fn retire(&mut self, song: Option<Box<Song>>) {
        if let Some(song) = song {
            if let Err(rtrb::PushError::Full(song)) = self.garbage.push(song) {
                // Leaking beats freeing on the real-time thread. The queue only fills if the
                // control thread stops collecting.
                std::mem::forget(song);
            }
        }
    }

    fn track_mut(&mut self, index: usize) -> Option<&mut Track> {
        self.song.as_deref_mut().and_then(|song| song.tracks.get_mut(index))
    }

    /// Mix frames `from..to` of the current block into `self.mix` and advance the clock.
    fn render_segment(&mut self, from: usize, to: usize) {
        let count = to - from;
        let mix = &mut self.mix[from * CHANNELS..to * CHANNELS];
        mix.fill(0.0);
        self.clock += count as u64;
        let Some(song) = self.song.as_deref_mut() else { return };
        if !self.playing {
            return;
        }
        let playable = (count as u64).min(song.length.saturating_sub(self.position)) as usize;
        let any_solo = song.tracks.iter().any(|track| track.soloed);
        let scratch = &mut self.scratch[..playable * CHANNELS];
        for track in &mut song.tracks {
            track.ramp.set(track.target(any_solo));
            if track.source.read(self.position, scratch) {
                self.underruns += 1;
            }
            let mut peak = track.peak;
            for (out, input) in mix.chunks_exact_mut(CHANNELS).zip(scratch.chunks_exact(CHANNELS)) {
                let gain = track.ramp.next_gain();
                let left = input[0] * gain;
                let right = input[1] * gain;
                out[0] += left;
                out[1] += right;
                peak = peak.max(left.abs()).max(right.abs());
            }
            track.peak = peak;
        }
        for frame in mix.chunks_exact(CHANNELS) {
            self.master_peak[0] = self.master_peak[0].max(frame[0].abs());
            self.master_peak[1] = self.master_peak[1].max(frame[1].abs());
        }
        self.position += playable as u64;
        if self.position >= song.length {
            self.playing = false;
        }
    }

    fn publish(&mut self, frames: usize) {
        self.frames_since_publish += frames;
        let release =
            (-(self.frames_since_publish as f32) / (METER_RELEASE_SECONDS * self.sample_rate as f32)).exp();
        self.frames_since_publish = 0;

        let state = self.state.input_buffer_mut();
        state.sample_rate = self.sample_rate;
        state.clock = self.clock;
        state.position = self.position;
        state.playing = self.playing;
        state.xruns = self.xruns;
        state.underruns = self.underruns;
        state.deferred_commands = self.deferred;
        state.cpu_load = self.cpu_load;
        for side in 0..2 {
            self.master[side] = self.master_peak[side].max(self.master[side] * release);
            self.master_peak[side] = 0.0;
        }
        state.master = self.master;
        match self.song.as_deref_mut() {
            Some(song) => {
                state.loaded = true;
                state.length = song.length;
                state.track_count = song.tracks.len();
                for (meter, track) in state.meters.iter_mut().zip(song.tracks.iter_mut()) {
                    track.meter = track.peak.max(track.meter * release);
                    track.peak = 0.0;
                    *meter = track.meter;
                }
            }
            None => {
                state.loaded = false;
                state.length = 0;
                state.track_count = 0;
            }
        }
        self.state.publish();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::{self, Engine};
    use crate::stream::{stream, FrameReader, MemoryReader};
    use crate::RAMP_FRAMES;
    use assert_no_alloc::assert_no_alloc;

    const RATE: u32 = 48_000;

    fn tone(frames: usize, seed: f32) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let t = i as f32 * 0.001 + seed;
                [t.sin() * 0.25, (t * 1.3).cos() * 0.25]
            })
            .collect()
    }

    /// Frame i is (i, i): reading the output tells which song frame played.
    fn index_track(frames: usize) -> Vec<f32> {
        (0..frames).flat_map(|i| [i as f32, i as f32]).collect()
    }

    fn engine_with(tracks: Vec<Vec<f32>>) -> (Engine, Mixer) {
        let (mut engine, mixer) = engine::new(RATE);
        let song = Song::new(tracks.into_iter().map(Source::memory).collect()).unwrap();
        engine.send(Command::LoadSong(Box::new(song))).unwrap();
        (engine, mixer)
    }

    fn render_no_alloc(mixer: &mut Mixer, frames: usize, block: usize) -> Vec<f32> {
        let mut out = vec![0.0; frames * CHANNELS];
        for chunk in out.chunks_mut(block * CHANNELS) {
            assert_no_alloc(|| mixer.process(chunk, CHANNELS));
        }
        out
    }

    #[test]
    fn offline_render_is_the_exact_sum_of_the_stems() {
        let frames = 10_000;
        let stems: Vec<Vec<f32>> = (0..4).map(|i| tone(frames, i as f32)).collect();
        let (mut engine, mut mixer) = engine_with(stems.clone());
        engine.send(Command::Play).unwrap();
        let out = render_no_alloc(&mut mixer, frames, 256);
        let expected: Vec<f32> = (0..frames * CHANNELS)
            .map(|i| stems.iter().fold(0.0, |sum, stem| sum + stem[i]))
            .collect();
        assert_eq!(out, expected);
    }

    #[test]
    fn a_scheduled_seek_lands_on_its_target_sample() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(100_000)]);
        engine.send(Command::Play).unwrap();
        // 700 is inside the third 256-frame callback.
        engine.schedule(At::Clock(700), Command::Seek(50_000)).unwrap();
        let out = render_no_alloc(&mut mixer, 1_024, 256);
        assert_eq!(out[699 * CHANNELS], 699.0);
        assert_eq!(out[700 * CHANNELS], 50_000.0);
        assert_eq!(out[1_023 * CHANNELS], 50_323.0);
    }

    #[test]
    fn a_scheduled_stop_lands_on_its_target_sample() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(10_000)]);
        engine.send(Command::Play).unwrap();
        engine.schedule(At::Clock(333), Command::Stop).unwrap();
        let out = render_no_alloc(&mut mixer, 512, 512);
        assert_eq!(out[332 * CHANNELS], 332.0);
        assert!(out[333 * CHANNELS..].iter().all(|&s| s == 0.0));
        let state = engine.state();
        assert!(!state.playing);
        assert_eq!(state.position, 333);
        assert_eq!(state.clock, 512);
    }

    #[test]
    fn commands_at_the_same_sample_apply_in_arrival_order() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(10_000)]);
        engine.schedule(At::Clock(100), Command::Seek(5_000)).unwrap();
        engine.schedule(At::Clock(100), Command::Play).unwrap();
        let out = render_no_alloc(&mut mixer, 200, 64);
        assert_eq!(out[99 * CHANNELS], 0.0);
        assert_eq!(out[100 * CHANNELS], 5_000.0);
        assert_eq!(out[199 * CHANNELS], 5_099.0);
    }

    #[test]
    fn gain_changes_ramp_instead_of_stepping() {
        let (mut engine, mut mixer) = engine_with(vec![vec![1.0; 4_000 * CHANNELS]]);
        engine.send(Command::Play).unwrap();
        engine.schedule(At::Clock(1_000), Command::Gain { track: 0, gain: 0.0 }).unwrap();
        let out = render_no_alloc(&mut mixer, 2_000, 128);
        let left: Vec<f32> = out.iter().step_by(CHANNELS).copied().collect();
        assert_eq!(left[999], 1.0);
        assert!(left[1_000] < 1.0 && left[1_000] > 0.9);
        assert!(left[1_000..1_000 + RAMP_FRAMES as usize].windows(2).all(|pair| pair[1] < pair[0]));
        assert!(left[1_000 + RAMP_FRAMES as usize..].iter().all(|&s| s == 0.0));
    }

    #[test]
    fn solo_silences_the_other_tracks_and_mute_wins() {
        let (mut engine, mut mixer) = engine_with(vec![vec![1.0; 2_000 * CHANNELS], vec![2.0; 2_000 * CHANNELS]]);
        engine.send(Command::Solo { track: 1, soloed: true }).unwrap();
        engine.send(Command::Play).unwrap();
        let out = render_no_alloc(&mut mixer, 1_000, 256);
        assert_eq!(out[999 * CHANNELS], 2.0);
        engine.send(Command::Mute { track: 1, muted: true }).unwrap();
        let out = render_no_alloc(&mut mixer, 1_000, 256);
        assert_eq!(out[999 * CHANNELS], 0.0);
    }

    #[test]
    fn playback_stops_at_the_end_of_the_song() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(300), index_track(500)]);
        engine.send(Command::Play).unwrap();
        let out = render_no_alloc(&mut mixer, 800, 256);
        assert_eq!(out[499 * CHANNELS], 499.0);
        assert!(out[500 * CHANNELS..].iter().all(|&s| s == 0.0));
        let state = engine.state();
        assert!(!state.playing);
        assert_eq!(state.position, 500);
        assert_eq!(state.length, 500);
    }

    #[test]
    fn a_stream_underrun_is_reported_in_the_state() {
        let all = index_track(50_000);
        let mut reader = MemoryReader::new(all.clone());
        reader.seek(256).unwrap();
        // The feeder never runs, so the ring stays empty after the 256-frame head.
        let (source, _feeder) = stream(all[..256 * CHANNELS].to_vec(), 50_000, Box::new(reader), 8);
        let (mut engine, mut mixer) = engine::new(RATE);
        engine.send(Command::LoadSong(Box::new(Song::new(vec![Source::Stream(source)]).unwrap()))).unwrap();
        engine.send(Command::Play).unwrap();
        render_no_alloc(&mut mixer, 256, 256);
        assert_eq!(engine.state().underruns, 0);
        render_no_alloc(&mut mixer, 256, 256);
        assert_eq!(engine.state().underruns, 1);
    }

    #[test]
    fn a_streamed_song_renders_like_the_same_song_in_memory() {
        let frames = 30_000;
        let samples = tone(frames, 0.5);
        let mut reader = MemoryReader::new(samples.clone());
        reader.seek(1_000).unwrap();
        let (source, mut feeder) = stream(samples[..1_000 * CHANNELS].to_vec(), frames as u64, Box::new(reader), 4);
        let (mut engine, mut mixer) = engine::new(RATE);
        engine.send(Command::LoadSong(Box::new(Song::new(vec![Source::Stream(source)]).unwrap()))).unwrap();
        engine.send(Command::Play).unwrap();
        let mut out = vec![0.0; frames * CHANNELS];
        for chunk in out.chunks_mut(512 * CHANNELS) {
            feeder.fill();
            assert_no_alloc(|| mixer.process(chunk, CHANNELS));
        }
        assert_eq!(out, samples);
        assert_eq!(engine.state().underruns, 0);
    }

    #[test]
    fn loading_a_song_returns_the_old_one_for_the_control_thread_to_free() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(100)]);
        render_no_alloc(&mut mixer, 64, 64);
        let song = Song::new(vec![Source::memory(index_track(200))]).unwrap();
        engine.send(Command::LoadSong(Box::new(song))).unwrap();
        render_no_alloc(&mut mixer, 64, 64);
        assert_eq!(engine.collect_garbage(), 1);
        assert_eq!(engine.state().length, 200);
    }

    #[test]
    fn mono_devices_get_the_sum_of_both_sides() {
        let (mut engine, mut mixer) = engine_with(vec![(0..100).flat_map(|_| [1.0, 0.5]).collect()]);
        engine.send(Command::Play).unwrap();
        let mut out = vec![0.0; 100];
        mixer.process(&mut out, 1);
        assert!(out.iter().all(|&s| s == 0.75));
    }

    #[test]
    fn extra_device_channels_are_silent() {
        let (mut engine, mut mixer) = engine_with(vec![vec![1.0; 200]]);
        engine.send(Command::Play).unwrap();
        let mut out = vec![9.0; 100 * 4];
        mixer.process(&mut out, 4);
        assert!(out.chunks_exact(4).all(|frame| frame == [1.0, 1.0, 0.0, 0.0]));
    }

    #[test]
    fn meters_hold_the_peak_and_release() {
        let (mut engine, mut mixer) = engine_with(vec![vec![0.5; 48_000 * CHANNELS]]);
        engine.send(Command::Play).unwrap();
        render_no_alloc(&mut mixer, 256, 256);
        assert_eq!(engine.state().meters[0], 0.5);
        engine.send(Command::Stop).unwrap();
        render_no_alloc(&mut mixer, 14_400, 256);
        let meter = engine.state().meters[0];
        assert!(meter < 0.5 * 0.4 && meter > 0.0, "{meter}");
    }
}
