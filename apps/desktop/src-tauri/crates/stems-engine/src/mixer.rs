//! The real-time core. Everything reachable from [`Mixer::process`] is allocation free, lock free
//! and does no I/O. `assert_no_alloc` checks this in the tests.
//!
//! Two clocks: the engine clock (frames rendered) schedules commands from the control thread; the
//! song timeline (the play head) carries quantized live actions, vamps, markers and the song end.

use std::f32::consts::FRAC_PI_2;

use crate::command::{At, Command, LiveAction, Scheduled, Transition, TransitionKind};
use crate::meter::Meter;
use crate::pad::{Pad, PAD_FADE_SECONDS};
use crate::ramp::Ramp;
use crate::routing::{Routing, Target, MAX_BUSES};
use crate::song::{MarkerAction, Song, Span, MAX_FADE};
use crate::source::Source;
use crate::state::{ArmedKind, EngineState};
use crate::{CHANNELS, MAX_BLOCK, MAX_TRACKS};
use crate::song::SongEvent;
use stems_control::MidiMessage;

pub use crate::song::{Track, TrackRole, TrackSpec};

/// Commands held by the mixer waiting for their target sample.
pub const SCHEDULE_CAPACITY: usize = 256;
/// Jump and stop crossfade length.
pub const FADE_SECONDS: f64 = 0.005;
/// Meter release time.
const METER_RELEASE_SECONDS: f32 = crate::meter::METER_SECONDS;
/// Samples between the starts of two buses in the bus buffer.
const BUS_STRIDE: usize = MAX_BLOCK * CHANNELS;
/// Events handled at one play-head position before rendering on (guards against loops).
const MAX_EVENTS_PER_STEP: usize = 16;

/// Things the mixer replaces and hands back to the control thread to free.
#[derive(Debug)]
pub enum Garbage {
    Song(Box<Song>),
    Source(Source),
    Pad(Box<Pad>),
    Routing(Box<Routing>),
}

#[derive(Debug, Clone, Copy)]
struct Armed {
    at: u64,
    action: LiveAction,
}

#[derive(Debug)]
struct Outgoing {
    song: Box<Song>,
    position: u64,
    fade: usize,
    fade_len: usize,
}

#[derive(Debug)]
struct PadSlot {
    pad: Box<Pad>,
    fade: usize,
    fade_len: usize,
    rising: bool,
}

/// An equal-power fade over `len` frames, `start` frames in.
#[derive(Debug, Clone, Copy)]
struct Envelope {
    start: usize,
    len: usize,
    rising: bool,
}

impl Envelope {
    #[inline]
    fn gain(self, index: usize) -> f32 {
        let t = ((self.start + index) as f32 + 0.5) / self.len.max(1) as f32;
        let t = t.min(1.0);
        if self.rising {
            (t * FRAC_PI_2).sin()
        } else {
            (t * FRAC_PI_2).cos()
        }
    }
}

/// Jump crossfade state shared by all tracks of the current song.
#[derive(Debug, Clone, Copy, Default)]
struct JumpFade {
    position: usize,
    len: usize,
    /// A stop: only the fading old audio sounds.
    stopping: bool,
}

impl JumpFade {
    fn active(self) -> bool {
        self.position < self.len
    }
}

/// Mix `frames` of `song` from `position` into each track's bus, `offset` frames into the block.
/// Returns the number of underrun reads.
#[allow(clippy::too_many_arguments)]
fn mix_song(
    song: &mut Song,
    routing: &Routing,
    position: u64,
    frames: usize,
    buses: &mut [f32],
    offset: usize,
    scratch: &mut [f32],
    envelope: Option<Envelope>,
    jump: JumpFade,
    silent: bool,
) -> u64 {
    let any_solo = song.tracks.iter().any(|track| track.soloed);
    let mut underruns = 0;
    let scratch = &mut scratch[..frames * CHANNELS];
    for track in &mut song.tracks {
        track.ramp.set(track.target(any_solo));
        if silent {
            scratch.fill(0.0);
        } else if track.source.read(position, scratch) {
            underruns += 1;
        }
        let timecode = track.role == TrackRole::Timecode;
        let bus = match track.bus(routing) {
            // An outgoing song's timecode stops at once: the incoming song's takes over.
            Some(bus) if !(timecode && envelope.is_some_and(|envelope| !envelope.rising)) => bus,
            _ => {
                for _ in 0..frames {
                    track.ramp.next_gain();
                }
                continue;
            }
        };
        let start = bus * BUS_STRIDE + offset * CHANNELS;
        let mix = &mut buses[start..start + frames * CHANNELS];
        let mut meter = track.meter;
        for (index, (out, input)) in mix.chunks_exact_mut(CHANNELS).zip(scratch.chunks_exact(CHANNELS)).enumerate() {
            let shaped = if timecode { 1.0 } else { envelope.map_or(1.0, |envelope| envelope.gain(index)) };
            let gain = track.ramp.next_gain() * shaped;
            let (mut left, mut right) = (input[0], input[1]);
            let fade = jump.position + index;
            if fade < jump.len && !timecode {
                let t = (fade as f32 + 0.5) / jump.len as f32;
                let (fade_in, fade_out) = ((t * FRAC_PI_2).sin(), (t * FRAC_PI_2).cos());
                left = left * fade_in + track.fade[fade * CHANNELS] * fade_out;
                right = right * fade_in + track.fade[fade * CHANNELS + 1] * fade_out;
            }
            left *= gain;
            right *= gain;
            out[0] += left;
            out[1] += right;
            meter.feed(left, right);
        }
        track.meter = meter;
    }
    underruns
}

/// Queue the cue events in song frames `[from, to)`. Messages that find the queue full are counted.
fn fire(events: &[SongEvent], from: u64, to: u64, midi: &mut rtrb::Producer<MidiMessage>, dropped: &mut u64) {
    let first = events.partition_point(|event| event.at < from);
    for event in events[first..].iter().take_while(|event| event.at < to) {
        if midi.push(event.message).is_err() {
            *dropped += 1;
        }
    }
}

pub struct Mixer {
    sample_rate: u32,
    commands: rtrb::Consumer<Scheduled>,
    /// Cue event messages for the MIDI thread.
    midi: rtrb::Producer<MidiMessage>,
    dropped_events: u64,
    garbage: rtrb::Producer<Garbage>,
    state: triple_buffer::Input<EngineState>,
    schedule: Vec<Scheduled>,
    song: Option<Box<Song>>,
    next: Option<Box<Song>>,
    transition: Transition,
    outgoing: Option<Outgoing>,
    clock: u64,
    position: u64,
    playing: bool,
    armed: Option<Armed>,
    vamp: Option<Span>,
    next_marker: usize,
    jump: JumpFade,
    fade_frames: usize,
    count_in: u64,
    waiting: u64,
    pad: Option<PadSlot>,
    old_pad: Option<PadSlot>,
    pad_gain: Ramp,
    pad_fade_frames: usize,
    scratch: Box<[f32]>,
    /// One stereo block per bus, `BUS_STRIDE` apart.
    buses: Box<[f32]>,
    routing: Box<Routing>,
    bus_levels: [Ramp; MAX_BUSES],
    bus_meters: [Meter; MAX_BUSES],
    device_channels: usize,
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
        garbage: rtrb::Producer<Garbage>,
        state: triple_buffer::Input<EngineState>,
        midi: rtrb::Producer<MidiMessage>,
    ) -> Self {
        Self {
            sample_rate,
            commands,
            midi,
            dropped_events: 0,
            garbage,
            state,
            schedule: Vec::with_capacity(SCHEDULE_CAPACITY),
            song: None,
            next: None,
            transition: Transition::default(),
            outgoing: None,
            clock: 0,
            position: 0,
            playing: false,
            armed: None,
            vamp: None,
            next_marker: 0,
            jump: JumpFade::default(),
            fade_frames: ((FADE_SECONDS * f64::from(sample_rate)).round() as usize).clamp(1, MAX_FADE),
            count_in: 0,
            waiting: 0,
            pad: None,
            old_pad: None,
            pad_gain: Ramp::new(0.8),
            pad_fade_frames: (PAD_FADE_SECONDS * f64::from(sample_rate)) as usize,
            scratch: vec![0.0; MAX_BLOCK * CHANNELS].into_boxed_slice(),
            buses: vec![0.0; MAX_BUSES * BUS_STRIDE].into_boxed_slice(),
            routing: Box::new(Routing::stereo()),
            bus_levels: [Ramp::new(1.0); MAX_BUSES],
            bus_meters: [Meter::default(); MAX_BUSES],
            device_channels: CHANNELS,
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

    /// Jump and stop crossfade length in frames.
    pub fn fade_frames(&self) -> usize {
        self.fade_frames
    }

    /// The device callback: mix into `out`, interleaved with `channels` channels. Each bus goes
    /// through its fader to the channels the routing gives it (`routing.rs` has the fold rules).
    pub fn process(&mut self, out: &mut [f32], channels: usize) {
        let channels = channels.max(1);
        self.device_channels = channels;
        let frames = out.len() / channels;
        let mut done = 0;
        while done < frames {
            let count = (frames - done).min(MAX_BLOCK);
            self.process_block(count);
            let destination = &mut out[done * channels..(done + count) * channels];
            destination.fill(0.0);
            self.route(destination, channels, count);
            done += count;
        }
        out[frames * channels..].fill(0.0);
        self.publish(frames);
    }

    /// Offline render with no device: `frames` stereo frames, through the same code as `process`.
    pub fn render(&mut self, frames: usize) -> Vec<f32> {
        self.render_channels(frames, CHANNELS)
    }

    /// Offline render to a device with `channels` outputs, interleaved.
    pub fn render_channels(&mut self, frames: usize, channels: usize) -> Vec<f32> {
        let mut out = vec![0.0; frames * channels.max(1)];
        self.process(&mut out, channels);
        out
    }

    /// Sum each bus, after its fader, into the device channels it is routed to.
    fn route(&mut self, destination: &mut [f32], channels: usize, frames: usize) {
        let mut master = self.master_peak;
        for (index, route) in self.routing.buses().iter().enumerate() {
            let level = &mut self.bus_levels[index];
            level.set(route.level());
            let meter = &mut self.bus_meters[index];
            let targets = route.targets(channels);
            let source = &self.buses[index * BUS_STRIDE..index * BUS_STRIDE + frames * CHANNELS];
            for (frame, input) in destination.chunks_exact_mut(channels).zip(source.chunks_exact(CHANNELS)) {
                let gain = level.next_gain();
                let (left, right) = (input[0] * gain, input[1] * gain);
                meter.feed(left, right);
                master[0] = master[0].max(left.abs());
                master[1] = master[1].max(right.abs());
                for target in targets.iter() {
                    match target {
                        Target::Stereo { left: l, right: r } => {
                            frame[usize::from(l)] += left;
                            frame[usize::from(r)] += right;
                        }
                        Target::Mono(channel) => frame[usize::from(channel)] += 0.5 * (left + right),
                    }
                }
            }
        }
        self.master_peak = master;
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
            while cursor < until {
                cursor += self.step(cursor, until - cursor);
            }
            if cursor >= frames {
                break;
            }
        }
    }

    // ── Commands ────────────────────────────────────────────────────────────────────────────

    fn apply(&mut self, command: Command) {
        match command {
            Command::Play => self.start(false),
            Command::PlayWithCountIn => self.start(true),
            Command::Stop => {
                self.count_in = 0;
                self.waiting = 0;
                if self.playing {
                    self.fade_stop();
                }
            }
            Command::Seek(position) => {
                if self.playing && self.count_in == 0 {
                    self.vamp = None;
                    self.jump_to(position);
                } else {
                    self.locate(position);
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
            Command::Arm { action, quantize } => self.arm(action, quantize),
            Command::CancelArmed => self.armed = None,
            Command::ReleaseVamp => self.vamp = None,
            Command::LoadSong(song) => {
                let old = self.song.replace(song);
                self.reset_play_head();
                self.retire_song(old);
            }
            Command::UnloadSong => {
                let old = self.song.take();
                self.reset_play_head();
                self.retire_song(old);
            }
            Command::PrepareNext { song, transition } => {
                let old = self.next.replace(song);
                self.transition = transition;
                self.retire_song(old);
            }
            Command::ClearNext => {
                let old = self.next.take();
                self.retire_song(old);
            }
            Command::Advance { play } => self.advance(play),
            Command::SetSource { track, source } => {
                let position = self.position;
                match self.track_mut(track) {
                    Some(track) => {
                        let mut source = source;
                        source.seek(position);
                        let old = std::mem::replace(&mut track.source, source);
                        self.retire(Garbage::Source(old));
                    }
                    None => self.retire(Garbage::Source(source)),
                }
            }
            Command::SetPad(pad) => self.set_pad(pad),
            Command::PadGain(gain) => self.pad_gain.set(if gain.is_finite() { gain.clamp(0.0, 4.0) } else { 0.0 }),
            Command::SetRouting(routing) => {
                let old = std::mem::replace(&mut self.routing, routing);
                self.retire(Garbage::Routing(old));
            }
            Command::BusGain { bus, gain } => {
                if let Some(route) = self.routing.bus_mut(bus) {
                    route.set_gain(gain);
                }
            }
            Command::BusMute { bus, muted } => {
                if let Some(route) = self.routing.bus_mut(bus) {
                    route.muted = muted;
                }
            }
            Command::TrackBus { track, bus } => {
                if let Some(track) = self.track_mut(track) {
                    track.bus = bus;
                }
            }
        }
    }

    fn reset_play_head(&mut self) {
        self.position = 0;
        self.playing = false;
        self.armed = None;
        self.vamp = None;
        self.next_marker = 0;
        self.jump = JumpFade::default();
        self.count_in = 0;
        self.waiting = 0;
    }

    fn start(&mut self, count_in: bool) {
        let Some(song) = self.song.as_deref_mut() else { return };
        if song.length == 0 {
            return;
        }
        if self.position >= song.length {
            self.position = 0;
            self.next_marker = 0;
            song.tracks.iter_mut().for_each(|track| track.source.seek(0));
        }
        self.waiting = 0;
        self.jump.stopping = false;
        self.count_in = match &song.timeline.count_in {
            Some((_, frames)) if count_in && self.position == 0 && !self.playing => *frames,
            _ => 0,
        };
        self.playing = true;
    }

    /// Move the play head without a fade (stopped, or counting in).
    fn locate(&mut self, position: u64) {
        let Some(song) = self.song.as_deref_mut() else { return };
        self.position = position.min(song.length);
        let position = self.position;
        song.tracks.iter_mut().for_each(|track| track.source.seek(position));
        self.next_marker = song.timeline.markers.partition_point(|marker| marker.at < position);
    }

    fn arm(&mut self, action: LiveAction, quantize: crate::tempo::Quantize) {
        let Some(song) = self.song.as_deref() else { return };
        if let LiveAction::Vamp = action {
            self.vamp = Some(song.loop_span(self.position));
            return;
        }
        if !self.playing || self.count_in > 0 {
            // Stopped: act now.
            match action {
                LiveAction::Jump { to } => self.locate(to),
                LiveAction::EndSong => self.advance(false),
                LiveAction::Stop | LiveAction::Vamp => {}
            }
            return;
        }
        let at = song.boundary(self.position, quantize);
        self.armed = Some(Armed { at, action });
    }

    fn track_mut(&mut self, index: usize) -> Option<&mut Track> {
        self.song.as_deref_mut().and_then(|song| song.tracks.get_mut(index))
    }

    fn retire(&mut self, garbage: Garbage) {
        if let Err(rtrb::PushError::Full(garbage)) = self.garbage.push(garbage) {
            // Leaking beats freeing on the real-time thread. The queue only fills if the
            // control thread stops collecting.
            std::mem::forget(garbage);
        }
    }

    fn retire_song(&mut self, song: Option<Box<Song>>) {
        if let Some(song) = song {
            self.retire(Garbage::Song(song));
        }
    }

    // ── Play-head actions ───────────────────────────────────────────────────────────────────

    /// Copy the next fade's worth of audio at the play head into each track's fade buffer.
    fn capture_fade(&mut self) {
        let frames = self.fade_frames;
        let position = self.position;
        if let Some(song) = self.song.as_deref_mut() {
            for track in &mut song.tracks {
                // An underrun here only shortens the fade tail; it is not counted.
                let _ = track.source.read(position, &mut track.fade[..frames * CHANNELS]);
            }
        }
        self.jump = JumpFade { position: 0, len: frames, stopping: false };
    }

    /// Jump with a crossfade from the old position to `to`.
    fn jump_to(&mut self, to: u64) {
        if self.song.is_none() {
            return;
        }
        self.capture_fade();
        self.locate(to);
    }

    /// Stop with a fade-out from the play head.
    fn fade_stop(&mut self) {
        self.capture_fade();
        self.jump.stopping = true;
        self.playing = false;
        self.armed = None;
        self.vamp = None;
    }

    fn run_action(&mut self, action: LiveAction) {
        match action {
            LiveAction::Jump { to } => {
                self.vamp = None;
                self.jump_to(to);
            }
            LiveAction::Vamp => {
                if let Some(song) = self.song.as_deref() {
                    self.vamp = Some(song.loop_span(self.position));
                }
            }
            LiveAction::Stop => self.fade_stop(),
            LiveAction::EndSong => self.end_song(),
        }
    }

    /// The song is over (its end, a `next` marker or an end-song action): run the transition.
    fn end_song(&mut self) {
        let has_next = self.next.is_some();
        match self.transition.kind {
            TransitionKind::Crossfade if has_next => self.start_crossfade(),
            TransitionKind::Auto if has_next => {
                self.fade_stop();
                self.waiting = self.transition.pre_wait;
                if self.waiting == 0 {
                    self.advance(true);
                }
            }
            _ => self.fade_stop(),
        }
    }

    fn start_crossfade(&mut self) {
        let Some(next) = self.next.take() else { return };
        let Some(old) = self.song.replace(next) else { return };
        if let Some(previous) = self.outgoing.take() {
            self.retire(Garbage::Song(previous.song));
        }
        let remaining = old.length.saturating_sub(self.position) as usize;
        let fade_len = (self.transition.crossfade as usize).min(remaining).max(self.fade_frames);
        self.outgoing = Some(Outgoing { song: old, position: self.position, fade: 0, fade_len });
        self.reset_play_head();
        self.playing = true;
    }

    fn advance(&mut self, play: bool) {
        let Some(next) = self.next.take() else { return };
        let old = self.song.replace(next);
        self.retire_song(old);
        self.reset_play_head();
        if play {
            self.start(true);
        }
    }

    fn set_pad(&mut self, pad: Option<Box<Pad>>) {
        if let Some(old) = self.old_pad.take() {
            self.retire(Garbage::Pad(old.pad));
        }
        if let Some(mut current) = self.pad.take() {
            // Fade out from wherever the fade-in had got to.
            let level = if current.rising { (current.fade.min(current.fade_len)) as f32 / current.fade_len.max(1) as f32 } else { 1.0 };
            current.fade = ((1.0 - level) * self.pad_fade_frames as f32) as usize;
            current.fade_len = self.pad_fade_frames;
            current.rising = false;
            self.old_pad = Some(current);
        }
        self.pad = pad.map(|pad| PadSlot { pad, fade: 0, fade_len: self.pad_fade_frames, rising: true });
    }

    /// Handle every play-head event due at the current position.
    fn run_due_events(&mut self) {
        for _ in 0..MAX_EVENTS_PER_STEP {
            if !self.playing || self.count_in > 0 {
                return;
            }
            let Some(song) = self.song.as_deref() else { return };
            let position = self.position;
            if let Some(span) = self.vamp {
                if position >= span.end {
                    self.jump_to(span.start);
                    continue;
                }
            }
            if let Some(armed) = self.armed {
                if armed.at <= position {
                    self.armed = None;
                    self.run_action(armed.action);
                    continue;
                }
            }
            if let Some(marker) = song.timeline.markers.get(self.next_marker).copied() {
                if marker.at <= position {
                    self.next_marker += 1;
                    match marker.action {
                        MarkerAction::Stop => self.fade_stop(),
                        MarkerAction::Loop => self.vamp = Some(song.loop_span(marker.at)),
                        MarkerAction::Next => self.end_song(),
                        MarkerAction::None => {}
                    }
                    continue;
                }
            }
            let crossfade_at = song.length.saturating_sub(self.transition.crossfade);
            if self.transition.kind == TransitionKind::Crossfade
                && self.next.is_some()
                && self.outgoing.is_none()
                && position >= crossfade_at
                && position < song.length
            {
                self.start_crossfade();
                continue;
            }
            if position >= song.length {
                self.end_song();
                continue;
            }
            return;
        }
    }

    /// Frames until the next play-head event, at least 1.
    fn frames_to_next_event(&self) -> u64 {
        let Some(song) = self.song.as_deref() else { return u64::MAX };
        let position = self.position;
        let mut next = song.length;
        if let Some(span) = self.vamp {
            next = next.min(span.end);
        }
        if let Some(armed) = self.armed {
            next = next.min(armed.at);
        }
        if let Some(marker) = song.timeline.markers.get(self.next_marker) {
            next = next.min(marker.at);
        }
        if self.transition.kind == TransitionKind::Crossfade && self.next.is_some() && self.outgoing.is_none() {
            let at = song.length.saturating_sub(self.transition.crossfade);
            if at > position {
                next = next.min(at);
            }
        }
        next.saturating_sub(position).max(1)
    }

    // ── Rendering ───────────────────────────────────────────────────────────────────────────

    /// Render up to `max` frames at `offset` in the block, stopping early at the next event.
    /// Returns the frames rendered (at least 1).
    fn step(&mut self, offset: usize, max: usize) -> usize {
        self.run_due_events();
        let mut frames = max;
        if self.count_in > 0 {
            frames = frames.min(self.count_in as usize);
        } else if self.waiting > 0 {
            frames = frames.min(self.waiting as usize);
        } else if self.playing {
            frames = frames.min(self.frames_to_next_event().min(max as u64) as usize);
        }
        let frames = frames.max(1);

        for bus in 0..self.routing.bus_count() {
            let start = bus * BUS_STRIDE + offset * CHANNELS;
            self.buses[start..start + frames * CHANNELS].fill(0.0);
        }
        let incoming = self.outgoing.as_ref().map(|out| Envelope { start: out.fade, len: out.fade_len, rising: true });
        let mut advance_now = false;

        if self.count_in > 0 {
            if let Some(song) = self.song.as_deref_mut() {
                if let (Some((sampler, total)), Some(click)) = (&song.timeline.count_in, song.click_index()) {
                    let scratch = &mut self.scratch[..frames * CHANNELS];
                    sampler.read(total - self.count_in, scratch);
                    let gain = song.tracks[click].target(false);
                    let bus = song.tracks[click].bus(&self.routing).unwrap_or(self.routing.roles.click);
                    let start = bus * BUS_STRIDE + offset * CHANNELS;
                    let mix = &mut self.buses[start..start + frames * CHANNELS];
                    for (out, input) in mix.iter_mut().zip(scratch.iter()) {
                        *out += input * gain;
                    }
                }
            }
            self.count_in -= frames as u64;
        } else if self.waiting > 0 {
            self.waiting -= frames as u64;
            advance_now = self.waiting == 0;
            if let Some(song) = self.song.as_deref_mut() {
                if self.jump.active() {
                    mix_song(song, &self.routing, self.position, frames, &mut self.buses, offset, &mut self.scratch, None, self.jump, true);
                }
            }
        } else if let Some(song) = self.song.as_deref_mut() {
            if self.playing {
                let playable = (frames as u64).min(song.length.saturating_sub(self.position)) as usize;
                self.underruns += mix_song(
                    song,
                    &self.routing,
                    self.position,
                    playable,
                    &mut self.buses,
                    offset,
                    &mut self.scratch,
                    incoming,
                    self.jump,
                    false,
                );
                let end = self.position + playable as u64;
                fire(&song.timeline.events, self.position, end, &mut self.midi, &mut self.dropped_events);
                self.position = end;
            } else if self.jump.active() {
                mix_song(song, &self.routing, self.position, frames, &mut self.buses, offset, &mut self.scratch, None, self.jump, true);
            }
        }
        if self.jump.active() {
            self.jump.position = (self.jump.position + frames).min(self.jump.len);
        }

        if let Some(out) = self.outgoing.as_mut() {
            let left = out.song.length.saturating_sub(out.position) as usize;
            let count = frames.min(left).min(out.fade_len.saturating_sub(out.fade));
            let envelope = Envelope { start: out.fade, len: out.fade_len, rising: false };
            mix_song(&mut out.song, &self.routing, out.position, count, &mut self.buses, offset, &mut self.scratch, Some(envelope), JumpFade::default(), false);
            out.position += count as u64;
            out.fade += frames;
            if out.fade >= out.fade_len || out.position >= out.song.length {
                if let Some(done) = self.outgoing.take() {
                    self.retire(Garbage::Song(done.song));
                }
            }
        }

        self.mix_pads(offset, frames);
        self.clock += frames as u64;
        if advance_now {
            self.advance(true);
        }
        frames
    }

    fn mix_pads(&mut self, offset: usize, frames: usize) {
        let start = self.routing.roles.pad * BUS_STRIDE + offset * CHANNELS;
        let mix = &mut self.buses[start..start + frames * CHANNELS];
        let ramp = self.pad_gain;
        let mut finished = false;
        if let Some(old) = self.old_pad.as_mut() {
            let mut gains = ramp;
            let envelope = Envelope { start: old.fade, len: old.fade_len, rising: false };
            old.pad.mix(mix, |index| gains.next_gain() * envelope.gain(index));
            old.fade += frames;
            finished = old.fade >= old.fade_len;
        }
        let mut gains = self.pad_gain;
        if let Some(current) = self.pad.as_mut() {
            let envelope = Envelope { start: current.fade, len: current.fade_len, rising: true };
            current.pad.mix(mix, |index| gains.next_gain() * envelope.gain(index));
            current.fade = (current.fade + frames).min(current.fade_len);
        } else {
            for _ in 0..frames {
                gains.next_gain();
            }
        }
        self.pad_gain = gains;
        if finished {
            if let Some(done) = self.old_pad.take() {
                self.retire(Garbage::Pad(done.pad));
            }
        }
    }

    fn publish(&mut self, frames: usize) {
        self.frames_since_publish += frames;
        let elapsed = self.frames_since_publish;
        let release = (-(elapsed as f32) / (METER_RELEASE_SECONDS * self.sample_rate as f32)).exp();
        self.frames_since_publish = 0;
        let rate = self.sample_rate;

        let state = self.state.input_buffer_mut();
        state.sample_rate = self.sample_rate;
        state.clock = self.clock;
        state.position = self.position;
        state.playing = self.playing;
        state.next_tag = self.next.as_ref().map_or(0, |song| song.tag);
        let (armed, armed_at, armed_to) = match self.armed {
            None => (ArmedKind::None, 0, 0),
            Some(Armed { at, action: LiveAction::Jump { to } }) => (ArmedKind::Jump, at, to),
            Some(Armed { at, action: LiveAction::Vamp }) => (ArmedKind::Vamp, at, 0),
            Some(Armed { at, action: LiveAction::Stop }) => (ArmedKind::Stop, at, 0),
            Some(Armed { at, action: LiveAction::EndSong }) => (ArmedKind::EndSong, at, 0),
        };
        state.armed = armed;
        state.armed_at = armed_at;
        state.armed_to = armed_to;
        state.vamping = self.vamp.is_some();
        state.vamp_start = self.vamp.map_or(0, |span| span.start);
        state.vamp_end = self.vamp.map_or(0, |span| span.end);
        state.count_in = self.count_in;
        state.waiting = self.waiting;
        state.crossfading = self.outgoing.is_some();
        state.pad = self.pad.is_some();
        state.xruns = self.xruns;
        state.underruns = self.underruns;
        state.deferred_commands = self.deferred;
        state.dropped_events = self.dropped_events;
        state.cpu_load = self.cpu_load;
        for side in 0..2 {
            self.master[side] = self.master_peak[side].max(self.master[side] * release);
            self.master_peak[side] = 0.0;
        }
        state.master = self.master;
        state.device_channels = self.device_channels;
        let bus_count = self.routing.bus_count();
        state.bus_count = bus_count;
        for (bus, meter) in self.bus_meters.iter_mut().enumerate() {
            if bus < bus_count {
                (state.bus_meters[bus], state.bus_rms[bus]) = meter.settle(elapsed, rate);
            } else {
                *meter = Meter::default();
                state.bus_meters[bus] = 0.0;
                state.bus_rms[bus] = 0.0;
            }
        }
        match self.song.as_deref_mut() {
            Some(song) => {
                state.loaded = true;
                state.song_tag = song.tag;
                state.length = song.length;
                state.track_count = song.tracks.len();
                for (index, track) in song.tracks.iter_mut().enumerate().take(MAX_TRACKS) {
                    (state.meters[index], state.rms[index]) = track.meter.settle(elapsed, rate);
                    state.track_buses[index] = track.bus(&self.routing).map_or(u8::MAX, |bus| bus as u8);
                }
            }
            None => {
                state.loaded = false;
                state.song_tag = 0;
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
    use crate::click::{self, ClickOptions};
    use crate::command::TransitionKind;
    use crate::engine::{self, Engine};
    use crate::sampler::Sampler;
    use crate::song::{Marker, Timeline};
    use crate::stream::{stream, FrameReader, MemoryReader};
    use crate::tempo::{Quantize, TempoMap};
    use crate::RAMP_FRAMES;
    use assert_no_alloc::assert_no_alloc;
    use std::sync::Arc;

    const RATE: u32 = 48_000;
    /// 120 bpm 4/4 at 48 kHz.
    const BEAT: u64 = 24_000;
    const BAR: u64 = 96_000;

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

    fn timeline(sections: &[(u64, u64)], markers: &[(u64, MarkerAction)]) -> Timeline {
        Timeline {
            sections: sections.iter().map(|&(start, end)| Span { start, end }).collect(),
            markers: markers.iter().map(|&(at, action)| Marker { at, action }).collect(),
            ..Timeline::plain(RATE)
        }
    }

    fn song(tag: u64, tracks: Vec<Vec<f32>>, timeline: Timeline) -> Box<Song> {
        Box::new(Song::build(tag, tracks.into_iter().map(|t| TrackSpec::stem(Source::memory(t))).collect(), timeline).unwrap())
    }

    fn engine_with(tracks: Vec<Vec<f32>>) -> (Engine, Mixer) {
        let (mut engine, mixer) = engine::new(RATE);
        engine.send(Command::LoadSong(song(1, tracks, Timeline::plain(RATE)))).unwrap();
        (engine, mixer)
    }

    fn render_no_alloc(mixer: &mut Mixer, frames: usize, block: usize) -> Vec<f32> {
        let mut out = vec![0.0; frames * CHANNELS];
        for chunk in out.chunks_mut(block * CHANNELS) {
            assert_no_alloc(|| mixer.process(chunk, CHANNELS));
        }
        out
    }

    fn left(out: &[f32]) -> Vec<f32> {
        out.iter().step_by(CHANNELS).copied().collect()
    }

    // ── M1 behaviour ─────────────────────────────────────────────────────────────────────

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
    fn a_scheduled_seek_lands_on_its_target_sample_with_a_crossfade() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(100_000)]);
        let fade = mixer.fade_frames();
        assert_eq!(fade, 240);
        engine.send(Command::Play).unwrap();
        engine.schedule(At::Clock(700), Command::Seek(50_000)).unwrap();
        let out = left(&render_no_alloc(&mut mixer, 2_048, 256));
        assert_eq!(out[699], 699.0);
        // The new position starts on the target sample, fading in over 5 ms.
        let t = 0.5 / fade as f32;
        let expected = 50_000.0 * (t * FRAC_PI_2).sin() + 700.0 * (t * FRAC_PI_2).cos();
        assert!((out[700] - expected).abs() < 0.01, "{} vs {expected}", out[700]);
        assert_eq!(out[700 + fade], (50_000 + fade) as f32);
        assert_eq!(out[2_047], (50_000 + 2_047 - 700) as f32);
    }

    #[test]
    fn a_seek_while_stopped_is_exact() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(100_000)]);
        engine.send(Command::Seek(12_345)).unwrap();
        engine.send(Command::Play).unwrap();
        let out = left(&render_no_alloc(&mut mixer, 10, 10));
        assert_eq!(out[0], 12_345.0);
    }

    #[test]
    fn a_scheduled_stop_fades_out_from_its_target_sample() {
        let (mut engine, mut mixer) = engine_with(vec![vec![1.0; 20_000 * CHANNELS]]);
        engine.send(Command::Play).unwrap();
        engine.schedule(At::Clock(333), Command::Stop).unwrap();
        let out = left(&render_no_alloc(&mut mixer, 1_024, 512));
        assert_eq!(out[332], 1.0);
        assert!(out[333] < 1.0 && out[333] > 0.99);
        assert!(out[333..333 + 240].windows(2).all(|pair| pair[1] <= pair[0]));
        assert!(out[333 + 240..].iter().all(|&s| s == 0.0));
        let state = engine.state();
        assert!(!state.playing);
        assert_eq!(state.position, 333);
        assert_eq!(state.clock, 1_024);
    }

    #[test]
    fn commands_at_the_same_sample_apply_in_arrival_order() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(10_000)]);
        engine.schedule(At::Clock(100), Command::Seek(5_000)).unwrap();
        engine.schedule(At::Clock(100), Command::Play).unwrap();
        let out = left(&render_no_alloc(&mut mixer, 200, 64));
        assert_eq!(out[99], 0.0);
        assert_eq!(out[100], 5_000.0);
        assert_eq!(out[199], 5_099.0);
    }

    #[test]
    fn gain_changes_ramp_instead_of_stepping() {
        let (mut engine, mut mixer) = engine_with(vec![vec![1.0; 4_000 * CHANNELS]]);
        engine.send(Command::Play).unwrap();
        engine.schedule(At::Clock(1_000), Command::Gain { track: 0, gain: 0.0 }).unwrap();
        let out = left(&render_no_alloc(&mut mixer, 2_000, 128));
        assert_eq!(out[999], 1.0);
        assert!(out[1_000] < 1.0 && out[1_000] > 0.9);
        assert!(out[1_000..1_000 + RAMP_FRAMES as usize].windows(2).all(|pair| pair[1] < pair[0]));
        assert!(out[1_000 + RAMP_FRAMES as usize..].iter().all(|&s| s == 0.0));
    }

    #[test]
    fn solo_silences_other_stems_but_not_the_click() {
        let (mut engine, mut mixer) = engine::new(RATE);
        let specs = vec![
            TrackSpec::stem(Source::memory(vec![1.0; 2_000 * CHANNELS])),
            TrackSpec::stem(Source::memory(vec![2.0; 2_000 * CHANNELS])),
            TrackSpec::with_role(Source::memory(vec![4.0; 2_000 * CHANNELS]), TrackRole::Click, 1.0),
        ];
        engine.send(Command::LoadSong(Box::new(Song::build(1, specs, Timeline::plain(RATE)).unwrap()))).unwrap();
        engine.send(Command::Solo { track: 1, soloed: true }).unwrap();
        engine.send(Command::Play).unwrap();
        let out = left(&render_no_alloc(&mut mixer, 1_000, 256));
        assert_eq!(out[999], 6.0);
        engine.send(Command::Mute { track: 1, muted: true }).unwrap();
        let out = left(&render_no_alloc(&mut mixer, 1_000, 256));
        assert_eq!(out[999], 4.0);
    }

    #[test]
    fn playback_stops_at_the_end_of_the_song() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(300), index_track(500)]);
        engine.send(Command::Play).unwrap();
        let out = left(&render_no_alloc(&mut mixer, 800, 256));
        assert_eq!(out[499], 499.0);
        assert!(out[500..].iter().all(|&s| s == 0.0));
        let state = engine.state();
        assert!(!state.playing);
        assert_eq!(state.position, 500);
    }

    #[test]
    fn a_stream_underrun_is_reported_in_the_state() {
        let all = index_track(50_000);
        let mut reader = MemoryReader::new(all.clone());
        reader.seek(256).unwrap();
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
    fn replaced_songs_return_to_the_control_thread() {
        let (mut engine, mut mixer) = engine_with(vec![index_track(100)]);
        render_no_alloc(&mut mixer, 64, 64);
        engine.send(Command::LoadSong(song(2, vec![index_track(200)], Timeline::plain(RATE)))).unwrap();
        render_no_alloc(&mut mixer, 64, 64);
        assert_eq!(engine.collect_garbage(), 1);
        let state = engine.state();
        assert_eq!((state.length, state.song_tag), (200, 2));
    }

    #[test]
    fn device_channel_layouts() {
        let (mut engine, mut mixer) = engine_with(vec![(0..100).flat_map(|_| [1.0, 0.5]).collect()]);
        engine.send(Command::Play).unwrap();
        let mut mono = vec![0.0; 50];
        mixer.process(&mut mono, 1);
        assert!(mono.iter().all(|&s| s == 0.75));
        let mut quad = vec![9.0; 50 * 4];
        mixer.process(&mut quad, 4);
        assert!(quad.chunks_exact(4).all(|frame| frame == [1.0, 0.5, 0.0, 0.0]));
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

    // ── M3: live actions ─────────────────────────────────────────────────────────────────

    /// Index track with sections every 2 bars: [0, 2), [2, 4), [4, 6), [6, 8) bars.
    fn sectioned(engine: &mut Engine, markers: &[(u64, MarkerAction)]) {
        let sections = [(0, 2 * BAR), (2 * BAR, 4 * BAR), (4 * BAR, 6 * BAR), (6 * BAR, 8 * BAR)];
        engine.send(Command::LoadSong(song(1, vec![index_track(8 * BAR as usize)], timeline(&sections, markers)))).unwrap();
    }

    /// Render `frames` in device-sized blocks and return the left channel.
    fn run(mixer: &mut Mixer, frames: u64) -> Vec<f32> {
        left(&render_no_alloc(mixer, frames as usize, 128))
    }

    #[test]
    fn a_jump_quantized_to_the_bar_lands_on_the_next_bar_line() {
        let (mut engine, mut mixer) = engine::new(RATE);
        sectioned(&mut engine, &[]);
        engine.send(Command::Play).unwrap();
        run(&mut mixer, 10_000);
        engine.send(Command::Arm { action: LiveAction::Jump { to: 4 * BAR }, quantize: Quantize::Bar }).unwrap();
        let out = run(&mut mixer, BAR);
        let state = engine.state();
        assert_eq!(state.armed, ArmedKind::None);
        // Frame BAR - 1 of the song plays at output index BAR - 1 - 10_000, then the jump.
        let at = (BAR - 10_000) as usize;
        assert_eq!(out[at - 1], (BAR - 1) as f32);
        assert_eq!(out[at + 240], (4 * BAR + 240) as f32);
        assert_eq!(state.position, 4 * BAR + 10_000);
    }

    #[test]
    fn armed_state_reports_target_and_destination() {
        let (mut engine, mut mixer) = engine::new(RATE);
        sectioned(&mut engine, &[]);
        engine.send(Command::Play).unwrap();
        engine.send(Command::Arm { action: LiveAction::Jump { to: 6 * BAR }, quantize: Quantize::Section }).unwrap();
        run(&mut mixer, 128);
        let state = engine.state();
        assert_eq!((state.armed, state.armed_at, state.armed_to), (ArmedKind::Jump, 2 * BAR, 6 * BAR));
        engine.send(Command::CancelArmed).unwrap();
        run(&mut mixer, 128);
        assert_eq!(engine.state().armed, ArmedKind::None);
    }

    #[test]
    fn a_vamp_loops_the_section_until_released() {
        let (mut engine, mut mixer) = engine::new(RATE);
        sectioned(&mut engine, &[]);
        engine.send(Command::Seek(2 * BAR + 1_000)).unwrap();
        engine.send(Command::Play).unwrap();
        engine.send(Command::Arm { action: LiveAction::Vamp, quantize: Quantize::Now }).unwrap();
        // Two passes through bars 2–4, and into a third.
        let out = run(&mut mixer, 2 * BAR - 1_000 + 2 * BAR + 500);
        let state = engine.state();
        assert!(state.vamping);
        assert_eq!((state.vamp_start, state.vamp_end), (2 * BAR, 4 * BAR));
        let first_loop = (2 * BAR - 1_000) as usize;
        assert_eq!(out[first_loop - 1], (4 * BAR - 1) as f32);
        assert_eq!(out[first_loop + 240], (2 * BAR + 240) as f32);
        assert_eq!(state.position, 2 * BAR + 500);
        // Released: play on into the next section.
        engine.send(Command::ReleaseVamp).unwrap();
        run(&mut mixer, 2 * BAR);
        assert_eq!(engine.state().position, 4 * BAR + 500);
    }

    #[test]
    fn stop_at_the_end_of_the_section() {
        let (mut engine, mut mixer) = engine::new(RATE);
        sectioned(&mut engine, &[]);
        engine.send(Command::Play).unwrap();
        engine.send(Command::Arm { action: LiveAction::Stop, quantize: Quantize::Section }).unwrap();
        run(&mut mixer, 3 * BAR);
        let state = engine.state();
        assert!(!state.playing);
        assert_eq!(state.position, 2 * BAR);
    }

    #[test]
    fn markers_stop_loop_and_end_the_song() {
        let (mut engine, mut mixer) = engine::new(RATE);
        sectioned(&mut engine, &[(BAR + 7, MarkerAction::Stop)]);
        engine.send(Command::Play).unwrap();
        run(&mut mixer, 2 * BAR);
        assert_eq!(engine.state().position, BAR + 7);
        assert!(!engine.state().playing);

        sectioned(&mut engine, &[(5 * BAR, MarkerAction::Loop)]);
        engine.send(Command::Seek(4 * BAR)).unwrap();
        engine.send(Command::Play).unwrap();
        run(&mut mixer, 3 * BAR);
        let state = engine.state();
        assert!(state.vamping);
        assert_eq!((state.vamp_start, state.vamp_end), (4 * BAR, 6 * BAR));
        assert_eq!(state.position, 5 * BAR);
    }

    #[test]
    fn count_in_plays_the_click_then_starts_the_song_on_time() {
        let (mut engine, mut mixer) = engine::new(RATE);
        let tempo = TempoMap::new(RATE, 120.0, 4, &[]);
        let options = ClickOptions { count_in_bars: 1, ..ClickOptions::default() };
        let (count_in, frames) = click::count_in(&tempo, &options, RATE).unwrap();
        let clicks = click::click_track(&tempo, 2 * BAR, &options, RATE);
        let specs = vec![
            TrackSpec::stem(Source::memory(vec![0.0; 2 * BAR as usize * CHANNELS])),
            TrackSpec::with_role(Source::Sampler(Arc::new(clicks)), TrackRole::Click, 1.0),
        ];
        let timeline = Timeline { tempo, count_in: Some((Arc::new(count_in), frames)), ..Timeline::plain(RATE) };
        engine.send(Command::LoadSong(Box::new(Song::build(1, specs, timeline).unwrap()))).unwrap();
        engine.send(Command::PlayWithCountIn).unwrap();
        let out = run(&mut mixer, BAR + BEAT);
        assert_eq!(frames, BAR);
        // Count-in clicks on each beat of the bar before the song.
        for beat in 0..4 {
            let at = (beat * BEAT) as usize;
            assert!(out[at..at + 2].iter().all(|&s| s.abs() < 0.05) && out[at + 10..at + 200].iter().any(|&s| s.abs() > 0.1), "beat {beat}");
        }
        // The song starts at BAR: its own click on beat 1 of bar 1 lands exactly there.
        assert!(out[BAR as usize - 200..BAR as usize].iter().all(|&s| s == 0.0));
        assert!(out[BAR as usize + 10..BAR as usize + 200].iter().any(|&s| s.abs() > 0.1));
        assert_eq!(engine.state().position, BEAT);
    }

    // ── M3: setlists ─────────────────────────────────────────────────────────────────────

    fn constant(tag: u64, value: f32, frames: u64) -> Box<Song> {
        song(tag, vec![vec![value; frames as usize * CHANNELS]], Timeline::plain(RATE))
    }

    #[test]
    fn stop_transition_waits_for_advance() {
        let (mut engine, mut mixer) = engine::new(RATE);
        engine.send(Command::LoadSong(constant(1, 1.0, 1_000))).unwrap();
        engine.send(Command::PrepareNext { song: constant(2, 2.0, 1_000), transition: Transition::default() }).unwrap();
        engine.send(Command::Play).unwrap();
        run(&mut mixer, 2_000);
        let state = engine.state();
        assert!(!state.playing);
        assert_eq!((state.song_tag, state.next_tag), (1, 2));
        engine.send(Command::Advance { play: true }).unwrap();
        let out = run(&mut mixer, 500);
        assert_eq!(out[400], 2.0);
        assert_eq!(engine.state().song_tag, 2);
    }

    #[test]
    fn auto_transition_starts_the_next_song_after_the_pre_wait() {
        let (mut engine, mut mixer) = engine::new(RATE);
        engine.send(Command::LoadSong(constant(1, 1.0, 1_000))).unwrap();
        let transition = Transition { kind: TransitionKind::Auto, pre_wait: 300, crossfade: 0 };
        engine.send(Command::PrepareNext { song: constant(2, 2.0, 1_000), transition }).unwrap();
        engine.send(Command::Play).unwrap();
        let out = run(&mut mixer, 1_600);
        assert_eq!(out[999], 1.0);
        assert!(out[1_000 + 240..1_300].iter().all(|&s| s == 0.0));
        assert_eq!(out[1_300], 2.0);
        assert_eq!(engine.state().song_tag, 2);
    }

    #[test]
    fn crossfade_transition_overlaps_the_end_and_the_start() {
        let (mut engine, mut mixer) = engine::new(RATE);
        engine.send(Command::LoadSong(constant(1, 1.0, 2_000))).unwrap();
        let transition = Transition { kind: TransitionKind::Crossfade, pre_wait: 0, crossfade: 500 };
        engine.send(Command::PrepareNext { song: constant(2, 1.0, 2_000), transition }).unwrap();
        engine.send(Command::Play).unwrap();
        let out = run(&mut mixer, 2_500);
        assert_eq!(out[1_499], 1.0);
        // Equal-power: sin + cos peaks at √2 in the middle of the fade.
        let middle = out[1_750];
        assert!((middle - std::f32::consts::SQRT_2).abs() < 0.01, "{middle}");
        assert!(out[2_000..].iter().all(|&s| (s - 1.0).abs() < 1e-6));
        let state = engine.state();
        assert_eq!((state.song_tag, state.position, state.crossfading), (2, 1_000, false));
    }

    #[test]
    fn a_ten_song_set_runs_start_to_finish_with_jumps_on_the_bar() {
        // Each song: 4 bars, sections every 2 bars, its tag as a constant level so the output
        // shows which song plays. Auto transitions with a one-beat pre-wait.
        let (mut engine, mut mixer) = engine::new(RATE);
        let make = |tag: u64| {
            let sections = timeline(&[(0, 2 * BAR), (2 * BAR, 4 * BAR)], &[]);
            song(tag, vec![vec![tag as f32; 4 * BAR as usize * CHANNELS]], sections)
        };
        let transition = Transition { kind: TransitionKind::Auto, pre_wait: BEAT, crossfade: 0 };
        engine.send(Command::LoadSong(make(1))).unwrap();
        engine.send(Command::PrepareNext { song: make(2), transition }).unwrap();
        engine.send(Command::Play).unwrap();

        let mut started = vec![(1u64, 0u64)];
        let mut clock = 0;
        let song_frames = 4 * BAR + BEAT;
        while started.len() < 10 || engine.state().playing {
            // In every song, a quantized jump from bar 1 to the second section.
            run(&mut mixer, 1_000);
            clock += 1_000;
            let state = engine.state();
            if state.song_tag != started.last().unwrap().0 {
                started.push((state.song_tag, clock));
                if state.song_tag < 10 {
                    engine.send(Command::PrepareNext { song: make(state.song_tag + 1), transition }).unwrap();
                }
                engine.send(Command::Arm { action: LiveAction::Jump { to: 2 * BAR }, quantize: Quantize::Bar }).unwrap();
            }
            assert!(clock < 20 * song_frames, "the set stalled at song {}", state.song_tag);
        }
        let tags: Vec<u64> = started.iter().map(|&(tag, _)| tag).collect();
        assert_eq!(tags, (1..=10).collect::<Vec<_>>());
        // Songs 2–10 jump at bar 1 (one bar after their start) to bar 2 → they last 3 bars + pre-wait.
        for pair in started.windows(2).skip(1) {
            let length = pair[1].1 - pair[0].1;
            assert!(length.abs_diff(3 * BAR + BEAT) <= 1_000, "{length}");
        }
        let state = engine.state();
        assert_eq!((state.song_tag, state.next_tag, state.underruns), (10, 0, 0));
    }

    // ── M3: pads ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn pads_fade_in_and_crossfade_without_a_transport() {
        let (mut engine, mut mixer) = engine::new(RATE);
        engine.send(Command::PadGain(1.0)).unwrap();
        engine.send(Command::SetPad(Some(Box::new(Pad::new(&vec![1.0; 96_000 * CHANNELS]))))).unwrap();
        let fade = (PAD_FADE_SECONDS * f64::from(RATE)) as usize;
        let out = run(&mut mixer, fade as u64 + 1_000);
        assert!(out[10] < 0.01);
        assert!(out[fade / 2] > 0.6 && out[fade / 2] < 0.8);
        assert!((out[fade + 500] - 1.0).abs() < 1e-6);
        assert!(engine.state().pad);
        engine.send(Command::SetPad(Some(Box::new(Pad::new(&vec![0.5; 96_000 * CHANNELS]))))).unwrap();
        let out = run(&mut mixer, fade as u64 + 1_000);
        assert!((out[fade + 500] - 0.5).abs() < 1e-6);
        assert_eq!(engine.collect_garbage(), 1);
    }

    #[test]
    fn sampler_tracks_mix_like_audio() {
        let (mut engine, mut mixer) = engine::new(RATE);
        let sampler = Sampler::new(vec![Arc::from(vec![1.0, 1.0])], vec![crate::sampler::Hit { at: 5, sound: 0, gain: 0.5 }], 100);
        let specs = vec![TrackSpec::with_role(Source::Sampler(Arc::new(sampler)), TrackRole::Click, 1.0)];
        engine.send(Command::LoadSong(Box::new(Song::build(1, specs, Timeline::plain(RATE)).unwrap()))).unwrap();
        engine.send(Command::Play).unwrap();
        let out = run(&mut mixer, 10);
        assert_eq!(out, [0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0]);
    }

    // ── M4 routing ───────────────────────────────────────────────────────────────────────

    /// FOH on 1/2, IEM on 3/4 and also a mono wedge on 9, Click on 5: a 16-out interface.
    fn tour_routing() -> Box<Routing> {
        use crate::routing::{BusDoc, RoutingDoc};
        let bus = |channels: Vec<u16>| BusDoc { gain: 1.0, mute: false, channels };
        let doc = RoutingDoc {
            buses: vec![bus(vec![0, 1]), bus(vec![2, 3, 8]), bus(vec![4])],
            stem_bus: 0,
            click_bus: 1,
            guide_bus: 1,
            pad_bus: 0,
            timecode_bus: None,
        };
        Box::new(Routing::from_doc(&doc).unwrap())
    }

    fn routed_engine() -> (Engine, Mixer) {
        let (mut engine, mixer) = engine::new(RATE);
        let specs = vec![
            TrackSpec::stem(Source::memory((0..2_000).flat_map(|_| [1.0, 0.5]).collect::<Vec<f32>>())),
            TrackSpec::stem(Source::memory(vec![2.0; 2_000 * CHANNELS])),
            TrackSpec::with_role(Source::memory(vec![4.0; 2_000 * CHANNELS]), TrackRole::Click, 1.0),
            TrackSpec::with_role(Source::memory(vec![8.0; 2_000 * CHANNELS]), TrackRole::Guide, 1.0),
        ];
        engine.send(Command::SetRouting(tour_routing())).unwrap();
        engine.send(Command::LoadSong(Box::new(Song::build(1, specs, Timeline::plain(RATE)).unwrap()))).unwrap();
        engine.send(Command::Play).unwrap();
        (engine, mixer)
    }

    fn render_device(mixer: &mut Mixer, frames: usize, channels: usize) -> Vec<f32> {
        let mut out = vec![0.0; frames * channels];
        for chunk in out.chunks_mut(128 * channels) {
            assert_no_alloc(|| mixer.process(chunk, channels));
        }
        out
    }

    #[test]
    fn click_and_guide_reach_the_in_ears_while_stems_reach_front_of_house() {
        let (mut engine, mut mixer) = routed_engine();
        let out = render_device(&mut mixer, 1_000, 16);
        let frame = &out[999 * 16..1_000 * 16];
        // FOH: the two stems only.
        assert_eq!(frame[0], 3.0);
        assert_eq!(frame[1], 2.5);
        // IEM: click plus guide, stereo on 3/4 and folded to mono on 9.
        assert_eq!(frame[2], 12.0);
        assert_eq!(frame[3], 12.0);
        assert_eq!(frame[8], 12.0);
        // Nothing on the Click bus, nothing anywhere else.
        assert!(frame.iter().enumerate().filter(|(index, _)| ![0, 1, 2, 3, 8].contains(index)).all(|(_, &s)| s == 0.0));
        let state = engine.state();
        assert_eq!(state.bus_count, 3);
        assert_eq!(state.device_channels, 16);
        assert_eq!(&state.track_buses[..4], &[0, 0, 1, 1]);
        assert_eq!(state.bus_meters[0], 3.0);
        assert_eq!(state.bus_meters[2], 0.0);
    }

    #[test]
    fn a_track_moves_to_another_bus_and_back_to_its_role_bus() {
        let (mut engine, mut mixer) = routed_engine();
        engine.send(Command::TrackBus { track: 1, bus: Some(2) }).unwrap();
        let out = render_device(&mut mixer, 500, 16);
        assert_eq!(out[499 * 16], 1.0);
        assert_eq!(out[499 * 16 + 4], 2.0);
        engine.send(Command::TrackBus { track: 1, bus: None }).unwrap();
        let out = render_device(&mut mixer, 500, 16);
        assert_eq!(out[499 * 16], 3.0);
        assert_eq!(out[499 * 16 + 4], 0.0);
    }

    #[test]
    fn bus_faders_ramp_and_mute_without_touching_other_buses() {
        let (mut engine, mut mixer) = routed_engine();
        render_device(&mut mixer, 256, 16);
        engine.send(Command::BusMute { bus: 1, muted: true }).unwrap();
        engine.send(Command::BusGain { bus: 0, gain: 0.5 }).unwrap();
        let out = render_device(&mut mixer, 512, 16);
        let iem: Vec<f32> = out.chunks_exact(16).map(|frame| frame[2]).collect();
        assert!(iem[0] < 12.0 && iem[0] > 11.0, "the mute ramps: {}", iem[0]);
        assert!(iem.windows(2).take(RAMP_FRAMES as usize - 1).all(|pair| pair[1] < pair[0]));
        assert!(iem[RAMP_FRAMES as usize..].iter().all(|&s| s == 0.0));
        assert_eq!(out[511 * 16], 1.5);
    }

    #[test]
    fn replacing_the_routing_hands_the_old_table_back() {
        let (mut engine, mut mixer) = routed_engine();
        render_device(&mut mixer, 128, 16);
        engine.send(Command::SetRouting(Box::default())).unwrap();
        let out = render_device(&mut mixer, 128, 16);
        // Everything back on 1/2.
        assert_eq!(out[127 * 16], 15.0);
        assert_eq!(out[127 * 16 + 2], 0.0);
        assert_eq!(engine.collect_garbage(), 2, "the default table and the tour table");
    }

    #[test]
    fn the_pad_plays_into_its_bus() {
        let (mut engine, mut mixer) = engine::new(RATE);
        let mut routing = *tour_routing();
        routing.roles.pad = 2;
        engine.send(Command::SetRouting(Box::new(routing))).unwrap();
        engine.send(Command::SetPad(Some(Box::new(Pad::new(&vec![1.0; 96_000 * CHANNELS]))))).unwrap();
        let fade = (PAD_FADE_SECONDS * f64::from(RATE)) as usize;
        let out = render_device(&mut mixer, fade + 256, 16);
        let last = &out[(fade + 255) * 16..(fade + 256) * 16];
        assert!(last[4] > 0.5);
        assert_eq!(last[0], 0.0);
    }

    // ── M5 timecode ──────────────────────────────────────────────────────────────────────

    fn ltc_song(timecode_bus: Option<usize>) -> (Engine, Mixer) {
        use stems_control::{FrameRate, LtcGenerator, Timecode};
        let (mut engine, mixer) = engine::new(RATE);
        let mut routing = *tour_routing();
        routing.roles.timecode = timecode_bus;
        let length = 10 * u64::from(RATE);
        let start = Timecode::parse("02:00:00:00", FrameRate::Fps25).unwrap();
        let ltc = LtcGenerator::new(FrameRate::Fps25, start, RATE, length);
        let specs = vec![
            TrackSpec::stem(Source::memory(vec![0.5; length as usize * CHANNELS])),
            TrackSpec::with_role(Source::Timecode(Arc::new(ltc)), TrackRole::Timecode, 0.25),
        ];
        engine.send(Command::SetRouting(Box::new(routing))).unwrap();
        engine.send(Command::LoadSong(Box::new(Song::build(1, specs, Timeline::plain(RATE)).unwrap()))).unwrap();
        (engine, mixer)
    }

    fn channel(out: &[f32], channels: usize, index: usize) -> Vec<f32> {
        out.chunks_exact(channels).map(|frame| frame[index]).collect()
    }

    #[test]
    fn ltc_plays_on_its_bus_only_and_decodes_from_the_song_start() {
        use stems_control::{ltc, FrameRate};
        let (mut engine, mut mixer) = ltc_song(Some(2));
        engine.send(Command::Play).unwrap();
        let out = render_device(&mut mixer, RATE as usize, 16);
        // The Click bus on output 5 carries LTC at the track level and nothing else.
        let wire = channel(&out, 16, 4);
        assert!(wire[RAMP_FRAMES as usize..].iter().all(|&s| s.abs() == 0.25));
        assert!(channel(&out, 16, 0).iter().all(|&s| s == 0.5));
        let decoded = ltc::decode(&wire, RATE, FrameRate::Fps25);
        assert!(decoded.len() >= 23);
        assert_eq!(decoded[0].to_string(), "02:00:00:01");
        assert_eq!(decoded.last().unwrap().to_string(), format!("02:00:00:{:02}", decoded.len()));
    }

    #[test]
    fn ltc_follows_a_jump_without_a_crossfade() {
        use stems_control::{ltc, FrameRate};
        let (mut engine, mut mixer) = ltc_song(Some(2));
        engine.send(Command::Play).unwrap();
        render_device(&mut mixer, 24_000, 16);
        engine.send(Command::Seek(5 * u64::from(RATE))).unwrap();
        let out = render_device(&mut mixer, 24_000, 16);
        let wire = channel(&out, 16, 4);
        // No blend of old and new timecode: every sample is a full-level LTC sample.
        assert!(wire.iter().all(|&s| s.abs() == 0.25));
        let decoded = ltc::decode(&wire, RATE, FrameRate::Fps25);
        assert_eq!(decoded[0].to_string(), "02:00:05:01");
    }

    #[test]
    fn ltc_with_no_timecode_bus_plays_nowhere() {
        let (mut engine, mut mixer) = ltc_song(None);
        engine.send(Command::Play).unwrap();
        let out = render_device(&mut mixer, 4_800, 16);
        assert!(out.chunks_exact(16).all(|frame| frame[0] == 0.5 && frame[1] == 0.5 && frame[2..].iter().all(|&s| s == 0.0)));
        assert_eq!(engine.state().track_buses[1], u8::MAX);
    }

    // ── M5 MIDI cue events ───────────────────────────────────────────────────────────────

    fn with_events(events: &[(u64, u8)], sections: &[(u64, u64)]) -> (Engine, Mixer, rtrb::Consumer<MidiMessage>) {
        let (mut engine, mixer) = engine::new(RATE);
        let mut timeline = timeline(sections, &[]);
        timeline.events = events.iter().map(|&(at, program)| SongEvent { at, message: MidiMessage::program_change(1, program) }).collect();
        engine.send(Command::LoadSong(song(1, vec![index_track(4 * BAR as usize)], timeline))).unwrap();
        let queue = engine.take_midi().unwrap();
        (engine, mixer, queue)
    }

    fn programs(queue: &mut rtrb::Consumer<MidiMessage>) -> Vec<u8> {
        std::iter::from_fn(|| queue.pop().ok()).map(|message| message.bytes()[1]).collect()
    }

    #[test]
    fn cue_events_fire_once_in_the_block_that_plays_them() {
        let (mut engine, mut mixer, mut queue) = with_events(&[(0, 1), (1_000, 2), (BAR, 3)], &[]);
        render_no_alloc(&mut mixer, 512, 512);
        assert!(programs(&mut queue).is_empty(), "stopped: nothing fires");
        engine.send(Command::Play).unwrap();
        render_no_alloc(&mut mixer, 512, 512);
        assert_eq!(programs(&mut queue), [1]);
        render_no_alloc(&mut mixer, 1_024, 512);
        assert_eq!(programs(&mut queue), [2]);
        run(&mut mixer, BAR);
        assert_eq!(programs(&mut queue), [3]);
    }

    #[test]
    fn a_jump_fires_the_events_at_its_target_and_skips_the_rest() {
        let (mut engine, mut mixer, mut queue) = with_events(&[(BAR, 7), (2 * BAR, 8)], &[(0, BAR), (BAR, 2 * BAR), (2 * BAR, 4 * BAR)]);
        engine.send(Command::Play).unwrap();
        render_no_alloc(&mut mixer, 512, 512);
        engine.send(Command::Arm { action: LiveAction::Jump { to: 2 * BAR }, quantize: Quantize::Now }).unwrap();
        run(&mut mixer, 1_000);
        assert_eq!(programs(&mut queue), [8]);
    }

    #[test]
    fn a_vamp_fires_its_events_on_every_pass() {
        let (mut engine, mut mixer, mut queue) = with_events(&[(BAR, 5)], &[(BAR, 2 * BAR)]);
        engine.send(Command::Seek(BAR)).unwrap();
        engine.send(Command::Play).unwrap();
        engine.send(Command::Arm { action: LiveAction::Vamp, quantize: Quantize::Now }).unwrap();
        run(&mut mixer, 3 * BAR - 10);
        assert_eq!(programs(&mut queue), [5, 5, 5]);
    }
}
