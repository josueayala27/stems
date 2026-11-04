//! Control-side handle to the mixer: builds songs from song documents (tracks, cue heads,
//! click, guide, timeline), sends commands, reads state and frees what the mixer hands back.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::click::{self, ClickOptions};
use crate::command::{At, Command, Scheduled, Transition, TransitionKind};
use crate::decode::FileReader;
use crate::guide::{self, Cue, GuideOptions, Voices};
use crate::mixer::{Garbage, Mixer, SCHEDULE_CAPACITY};
use stems_control::{FrameRate, LtcGenerator, Timecode};

use crate::pad::Pad;
use crate::routing::{Routing, RoutingDoc};
use crate::sampler::Sampler;
use crate::song::{Marker, MarkerAction, Song, Span, Timeline, TrackRole, TrackSpec};
use crate::source::Source;
use crate::state::EngineState;
use crate::stream::{self, Feeder, FrameReader, Head, StreamFeeder, CUE_SECONDS, HEAD_SECONDS};
use crate::tempo::{TempoMap, TempoPoint};
use crate::{EngineError, CHANNELS};

const GARBAGE_CAPACITY: usize = 32;

// ── Song documents (the `@stems/schema` song, as much as the engine needs) ──────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSignature {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TempoPointDoc {
    pub sample: u64,
    pub bpm: f64,
    pub time_signature: TimeSignature,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDoc {
    pub file: PathBuf,
    #[serde(default = "stem_role")]
    pub kind: TrackRole,
    #[serde(default = "unity")]
    pub gain: f32,
    #[serde(default)]
    pub mute: bool,
    /// Bus index in the rig. `None` plays into the bus the rig gives the track's kind.
    #[serde(default)]
    pub bus: Option<usize>,
}

fn stem_role() -> TrackRole {
    TrackRole::Stem
}

fn unity() -> f32 {
    1.0
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionDoc {
    pub name: String,
    pub start_sample: u64,
    pub end_sample: u64,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkerDoc {
    pub sample: u64,
    pub action: MarkerAction,
}

/// The song as the UI stores it. Positions are at `sample_rate`; the engine converts them to the
/// device rate.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongDoc {
    pub sample_rate: u32,
    pub bpm: f64,
    pub time_signature: TimeSignature,
    #[serde(default)]
    pub tempo_map: Vec<TempoPointDoc>,
    pub tracks: Vec<TrackDoc>,
    #[serde(default)]
    pub sections: Vec<SectionDoc>,
    #[serde(default)]
    pub markers: Vec<MarkerDoc>,
    /// LTC label at the song start (`HH:MM:SS:FF`), for example `03:00:00:00` for the third song
    /// with one timecode hour per song. `None` uses the timecode options' start.
    #[serde(default)]
    pub timecode_start: Option<String>,
}

impl SongDoc {
    /// A rate of 0 means "positions are already at the device rate".
    fn at_rate(&self, device_rate: u32) -> SongDoc {
        let mut doc = self.clone();
        if doc.sample_rate == 0 {
            doc.sample_rate = device_rate;
        }
        doc
    }

    /// Stems at 120 bpm with no timeline, for quick playback of plain files.
    pub fn from_files(paths: &[PathBuf], sample_rate: u32) -> Self {
        Self {
            sample_rate,
            bpm: 120.0,
            time_signature: TimeSignature { numerator: 4, denominator: 4 },
            tempo_map: Vec::new(),
            tracks: paths.iter().map(|file| TrackDoc { file: file.clone(), kind: TrackRole::Stem, gain: 1.0, mute: false, bus: None }).collect(),
            sections: Vec::new(),
            markers: Vec::new(),
            timecode_start: None,
        }
    }
}

/// Click, guide and timecode settings (app settings, not per song).
#[derive(Debug, Clone, PartialEq, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PerformOptions {
    pub click: ClickOptions,
    pub guide: GuideOptions,
    pub timecode: TimecodeOptions,
}

/// LTC out. It plays into the rig's timecode bus only, never a fallback bus.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TimecodeOptions {
    pub enabled: bool,
    pub rate: FrameRate,
    /// The label at the start of each song (`HH:MM:SS:FF`), unless the song document gives its own.
    pub start: String,
    pub gain: f32,
}

impl Default for TimecodeOptions {
    fn default() -> Self {
        Self { enabled: false, rate: FrameRate::Fps30, start: "01:00:00:00".into(), gain: 0.25 }
    }
}

impl TimecodeOptions {
    /// The start label for a song: its own, else the options', else midnight.
    fn start_for(&self, song_start: Option<&str>) -> Timecode {
        song_start
            .and_then(|text| Timecode::parse(text, self.rate).ok())
            .or_else(|| Timecode::parse(&self.start, self.rate).ok())
            .unwrap_or_else(|| Timecode::from_frames(0, self.rate))
    }

    fn generator(&self, song_start: Option<&str>, rate: u32, length: u64) -> LtcGenerator {
        LtcGenerator::new(self.rate, self.start_for(song_start), rate, length)
    }
}

/// How to reach the next song, as the setlist stores it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionDoc {
    pub kind: TransitionKindDoc,
    #[serde(default)]
    pub pre_wait_ms: u64,
    #[serde(default = "default_crossfade_ms")]
    pub crossfade_ms: u64,
}

fn default_crossfade_ms() -> u64 {
    4_000
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TransitionKindDoc {
    #[default]
    Stop,
    Auto,
    Crossfade,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub path: PathBuf,
    /// Rate of the file. The engine resamples to the device rate when it differs.
    pub file_sample_rate: u32,
    pub channels: usize,
    /// Length in frames at the device rate.
    pub frames: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongInfo {
    /// Identifies the song in engine state (`songTag`, `nextTag`).
    pub tag: u64,
    pub sample_rate: u32,
    /// Frames at the device rate: the longest track.
    pub length: u64,
    pub tracks: Vec<TrackInfo>,
    /// Engine track indexes of the generated click and guide (after the audio tracks).
    pub click_track: usize,
    pub guide_track: usize,
    pub timecode_track: usize,
}

// ── Engine ─────────────────────────────────────────────────────────────────────────────────

pub struct Engine {
    sample_rate: u32,
    commands: rtrb::Producer<Scheduled>,
    garbage: rtrb::Consumer<Garbage>,
    state: triple_buffer::Output<EngineState>,
    feeders: HashMap<u64, Feeder>,
    docs: HashMap<u64, SongDoc>,
    next_tag: u64,
    current: Option<u64>,
    options: PerformOptions,
    voices: Option<(PathBuf, Voices)>,
}

/// A connected control handle and real-time mixer at `sample_rate`. The mixer goes to the device
/// callback, or renders offline with [`Mixer::render`].
pub fn new(sample_rate: u32) -> (Engine, Mixer) {
    let (command_tx, command_rx) = rtrb::RingBuffer::new(SCHEDULE_CAPACITY);
    let (garbage_tx, garbage_rx) = rtrb::RingBuffer::new(GARBAGE_CAPACITY);
    let (state_in, state_out) = triple_buffer::triple_buffer(&EngineState::new(sample_rate));
    let engine = Engine {
        sample_rate,
        commands: command_tx,
        garbage: garbage_rx,
        state: state_out,
        feeders: HashMap::new(),
        docs: HashMap::new(),
        next_tag: 1,
        current: None,
        options: PerformOptions::default(),
        voices: None,
    };
    (engine, Mixer::new(sample_rate, command_rx, garbage_tx, state_in))
}

fn to_device(sample: u64, from: u32, to: u32) -> u64 {
    if from == to || from == 0 {
        return sample;
    }
    (u128::from(sample) * u128::from(to) / u128::from(from)) as u64
}

impl Engine {
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn send(&mut self, command: Command) -> crate::Result<()> {
        self.schedule(At::Now, command)
    }

    pub fn schedule(&mut self, at: At, command: Command) -> crate::Result<()> {
        self.commands.push(Scheduled { at, command }).map_err(|_| EngineError::QueueFull)
    }

    /// The latest published state. Also frees what the mixer handed back.
    pub fn state(&mut self) -> EngineState {
        self.collect_garbage();
        *self.state.read()
    }

    /// Free songs, sources and pads the mixer handed back, and stop the disk threads of songs
    /// that are gone. Returns how many items came back.
    pub fn collect_garbage(&mut self) -> usize {
        let mut count = 0;
        while let Ok(garbage) = self.garbage.pop() {
            if let Garbage::Song(song) = &garbage {
                self.feeders.remove(&song.tag());
                self.docs.remove(&song.tag());
            }
            drop(garbage);
            count += 1;
        }
        count
    }

    pub fn options(&self) -> &PerformOptions {
        &self.options
    }

    fn voices(&mut self) -> Voices {
        let folder = self.options.guide.voices.clone();
        match (&self.voices, folder) {
            (Some((loaded, voices)), Some(folder)) if *loaded == folder => voices.clone(),
            (_, Some(folder)) => {
                let voices = Voices::load(&folder, self.sample_rate);
                self.voices = Some((folder, voices.clone()));
                voices
            }
            (_, None) => Voices::default(),
        }
    }

    fn timeline(&self, doc: &SongDoc) -> TempoMap {
        let doc = &doc.at_rate(self.sample_rate);
        let rate = self.sample_rate;
        let points: Vec<TempoPoint> = doc
            .tempo_map
            .iter()
            .map(|point| TempoPoint {
                sample: to_device(point.sample, doc.sample_rate, rate),
                bpm: point.bpm,
                numerator: point.time_signature.numerator,
            })
            .collect();
        TempoMap::new(rate, doc.bpm, doc.time_signature.numerator, &points)
    }

    fn generated(&mut self, doc: &SongDoc, tempo: &TempoMap, length: u64) -> (Sampler, Sampler) {
        let voices = self.voices();
        generated_tracks(doc, tempo, length, &self.options, &voices, self.sample_rate)
    }

    /// Everything needed to build a song, taken from the engine so the slow part (decoding
    /// heads and cue points) can run on another thread. Cheap.
    pub fn build_job(&mut self, doc: &SongDoc) -> BuildJob {
        let rate = self.sample_rate;
        let doc = doc.at_rate(rate);
        let tag = self.next_tag;
        self.next_tag += 1;
        let tempo = self.timeline(&doc);
        let voices = self.voices();
        BuildJob { tag, rate, doc, tempo, options: self.options.clone(), voices }
    }

    fn transition(&self, transition: TransitionDoc) -> Transition {
        let frames = |ms: u64| ms * u64::from(self.sample_rate) / 1_000;
        Transition {
            kind: match transition.kind {
                TransitionKindDoc::Stop => TransitionKind::Stop,
                TransitionKindDoc::Auto => TransitionKind::Auto,
                TransitionKindDoc::Crossfade => TransitionKind::Crossfade,
            },
            pre_wait: frames(transition.pre_wait_ms),
            crossfade: frames(transition.crossfade_ms),
        }
    }

    /// Hand a built song to the mixer: as the current song, or as the next one.
    pub fn install(&mut self, built: Built, next: Option<TransitionDoc>) -> crate::Result<SongInfo> {
        let Built { song, feeders, info, doc } = built;
        if info.sample_rate != self.sample_rate {
            return Err(EngineError::Superseded);
        }
        self.feeders.insert(info.tag, Feeder::spawn(feeders)?);
        let command = match next {
            None => Command::LoadSong(Box::new(song)),
            Some(transition) => Command::PrepareNext { song: Box::new(song), transition: self.transition(transition) },
        };
        if let Err(error) = self.send(command) {
            self.feeders.remove(&info.tag);
            return Err(error);
        }
        self.docs.insert(info.tag, doc);
        if next.is_none() {
            self.current = Some(info.tag);
        }
        Ok(info)
    }

    /// Make `doc` the current song, building it on this thread.
    pub fn load_song(&mut self, doc: &SongDoc) -> crate::Result<SongInfo> {
        let built = self.build_job(doc).run()?;
        self.install(built, None)
    }

    /// Preload `doc` as the next song, reached with `transition` when the current one ends.
    pub fn prepare_next(&mut self, doc: &SongDoc, transition: TransitionDoc) -> crate::Result<SongInfo> {
        let built = self.build_job(doc).run()?;
        self.install(built, Some(transition))
    }

    pub fn clear_next(&mut self) -> crate::Result<()> {
        self.send(Command::ClearNext)
    }

    /// Play plain files as one song (the `play` example, quick checks).
    pub fn load_files(&mut self, paths: &[PathBuf]) -> crate::Result<SongInfo> {
        let mut options = self.options.clone();
        options.click.enabled = false;
        options.click.count_in_bars = 0;
        let saved = std::mem::replace(&mut self.options, options);
        let result = self.load_song(&SongDoc::from_files(paths, self.sample_rate));
        self.options = saved;
        result
    }

    pub fn unload(&mut self) -> crate::Result<()> {
        self.current = None;
        self.send(Command::UnloadSong)
    }

    /// New click and guide settings. The current song's generated tracks are rebuilt.
    pub fn set_options(&mut self, options: PerformOptions) -> crate::Result<()> {
        self.options = options;
        let state = *self.state.read();
        let tag = state.song_tag;
        let Some(doc) = self.docs.get(&tag).cloned() else { return Ok(()) };
        let tempo = self.timeline(&doc);
        let (click, guide) = self.generated(&doc, &tempo, state.length);
        let click_track = doc.tracks.len();
        let guide_track = click_track + 1;
        let click_options = self.options.click;
        let guide_options = self.options.guide.clone();
        self.send(Command::SetSource { track: click_track, source: Source::Sampler(Arc::new(click)) })?;
        self.send(Command::Gain { track: click_track, gain: click_options.gain })?;
        self.send(Command::Mute { track: click_track, muted: !click_options.enabled })?;
        self.send(Command::SetSource { track: guide_track, source: Source::Sampler(Arc::new(guide)) })?;
        self.send(Command::Gain { track: guide_track, gain: guide_options.gain })?;
        self.send(Command::Mute { track: guide_track, muted: !guide_options.enabled })?;
        let timecode_track = guide_track + 1;
        let timecode = self.options.timecode.clone();
        let generator = timecode.generator(doc.timecode_start.as_deref(), self.sample_rate, state.length);
        self.send(Command::SetSource { track: timecode_track, source: Source::Timecode(Arc::new(generator)) })?;
        self.send(Command::Gain { track: timecode_track, gain: timecode.gain })?;
        self.send(Command::Mute { track: timecode_track, muted: !timecode.enabled })
    }

    /// Replace the rig's buses and routing. Every song, loaded or not, plays through it.
    pub fn set_routing(&mut self, doc: &RoutingDoc) -> crate::Result<()> {
        let routing = Routing::from_doc(doc)?;
        self.send(Command::SetRouting(Box::new(routing)))
    }

    /// Crossfade to a pad decoded from `file`, or fade the pad out with `None`.
    pub fn set_pad(&mut self, file: Option<&Path>) -> crate::Result<()> {
        let pad = file.map(|file| decode_pad(file, self.sample_rate)).transpose()?;
        self.install_pad(pad)
    }

    pub fn install_pad(&mut self, pad: Option<Box<Pad>>) -> crate::Result<()> {
        self.send(Command::SetPad(pad))
    }
}

/// Decode a pad file into a seamless loop. Slow: run it off the control thread.
pub fn decode_pad(file: &Path, sample_rate: u32) -> crate::Result<Box<Pad>> {
    let samples = decode_all(file, sample_rate)?;
    Ok(Box::new(Pad::new(&samples)))
}

/// The slow half of loading a song. `Send`, so it runs on a worker thread.
pub struct BuildJob {
    tag: u64,
    rate: u32,
    doc: SongDoc,
    tempo: TempoMap,
    options: PerformOptions,
    voices: Voices,
}

/// A song ready for [`Engine::install`].
pub struct Built {
    song: Song,
    feeders: Vec<StreamFeeder>,
    info: SongInfo,
    doc: SongDoc,
}

impl Built {
    pub fn tag(&self) -> u64 {
        self.info.tag
    }
}

impl BuildJob {
    pub fn tag(&self) -> u64 {
        self.tag
    }

    /// Open every track (in parallel: head and cue points decode now), build click, guide and
    /// the timeline.
    pub fn run(self) -> crate::Result<Built> {
        let BuildJob { tag, rate, doc, tempo, options, voices } = self;
        let mut cue_points: Vec<u64> = doc
            .sections
            .iter()
            .map(|section| to_device(section.start_sample, doc.sample_rate, rate))
            .chain(doc.markers.iter().map(|marker| to_device(marker.sample, doc.sample_rate, rate)))
            .collect();
        cue_points.sort_unstable();
        cue_points.dedup();

        let opened: Vec<crate::Result<_>> = std::thread::scope(|scope| {
            let handles: Vec<_> = doc
                .tracks
                .iter()
                .map(|track| {
                    let cue_points = &cue_points;
                    scope.spawn(move || open_track(&track.file, rate, cue_points))
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap_or_else(|_| Err(EngineError::Decode("a track failed to open".into()))))
                .collect()
        });

        let mut specs = Vec::with_capacity(doc.tracks.len() + 2);
        let mut feeders = Vec::with_capacity(doc.tracks.len());
        let mut tracks = Vec::with_capacity(doc.tracks.len());
        for (track, result) in doc.tracks.iter().zip(opened) {
            let (source, feeder, info) = result?;
            specs.push(TrackSpec { source: Source::Stream(source), role: track.kind, gain: track.gain, muted: track.mute, bus: track.bus });
            feeders.push(feeder);
            tracks.push(info);
        }
        let length = tracks.iter().map(|track| track.frames).max().unwrap_or(0);
        let (click, guide) = generated_tracks(&doc, &tempo, length, &options, &voices, rate);
        let click_track = specs.len();
        specs.push(TrackSpec {
            source: Source::Sampler(Arc::new(click)),
            role: TrackRole::Click,
            gain: options.click.gain,
            muted: !options.click.enabled,
            bus: None,
        });
        let guide_track = specs.len();
        specs.push(TrackSpec {
            source: Source::Sampler(Arc::new(guide)),
            role: TrackRole::Guide,
            gain: options.guide.gain,
            muted: !options.guide.enabled,
            bus: None,
        });

        let timecode_track = specs.len();
        specs.push(TrackSpec {
            source: Source::Timecode(Arc::new(options.timecode.generator(doc.timecode_start.as_deref(), rate, length))),
            role: TrackRole::Timecode,
            gain: options.timecode.gain,
            muted: !options.timecode.enabled,
            bus: None,
        });

        let sections = doc
            .sections
            .iter()
            .map(|section| Span {
                start: to_device(section.start_sample, doc.sample_rate, rate),
                end: to_device(section.end_sample, doc.sample_rate, rate),
            })
            .collect();
        let markers = doc
            .markers
            .iter()
            .map(|marker| Marker { at: to_device(marker.sample, doc.sample_rate, rate), action: marker.action })
            .collect();
        let count_in = click::count_in(&tempo, &options.click, rate).map(|(sampler, frames)| (Arc::new(sampler), frames));
        let timeline = Timeline { tempo, sections, markers, count_in };
        let song = Song::build(tag, specs, timeline)?;
        let info = SongInfo { tag, sample_rate: rate, length: song.length(), tracks, click_track, guide_track, timecode_track };
        Ok(Built { song, feeders, info, doc })
    }
}

fn generated_tracks(
    doc: &SongDoc,
    tempo: &TempoMap,
    length: u64,
    options: &PerformOptions,
    voices: &Voices,
    rate: u32,
) -> (Sampler, Sampler) {
    let click = click::click_track(tempo, length, &options.click, rate);
    let cues: Vec<Cue> = doc
        .sections
        .iter()
        .map(|section| Cue { name: section.name.clone(), start: to_device(section.start_sample, doc.sample_rate, rate) })
        .collect();
    let guide = guide::guide_track(tempo, &cues, voices, &options.guide, length);
    (click, guide)
}

fn read_frames(reader: &mut FileReader, frames: usize) -> Vec<f32> {
    let mut samples = vec![0.0; frames * CHANNELS];
    let mut filled = 0;
    while filled < frames {
        let read = reader.read(&mut samples[filled * CHANNELS..]);
        if read == 0 {
            break;
        }
        filled += read;
    }
    samples.truncate(filled * CHANNELS);
    samples
}

fn decode_all(path: &Path, sample_rate: u32) -> crate::Result<Vec<f32>> {
    let mut reader = FileReader::open(path, sample_rate)?;
    let frames = reader.frames() as usize;
    Ok(read_frames(&mut reader, frames))
}

fn open_track(
    path: &Path,
    sample_rate: u32,
    cue_points: &[u64],
) -> crate::Result<(stream::StreamSource, StreamFeeder, TrackInfo)> {
    let mut reader = FileReader::open(path, sample_rate)?;
    let frames = reader.frames();
    let head_frames = (u64::from(sample_rate) * HEAD_SECONDS).min(frames) as usize;
    let head = read_frames(&mut reader, head_frames);
    let decoded_head = (head.len() / CHANNELS) as u64;

    let cue_frames = (CUE_SECONDS * f64::from(sample_rate)) as usize;
    let mut cues = Vec::new();
    let wanted: Vec<u64> = cue_points.iter().copied().filter(|&at| at >= decoded_head && at < frames).collect();
    if !wanted.is_empty() {
        let mut cue_reader = FileReader::open(path, sample_rate)?;
        for at in wanted {
            if cue_reader.seek(at).is_ok() {
                let samples = read_frames(&mut cue_reader, cue_frames);
                cues.push(Head { start: at, samples: samples.into() });
            }
        }
    }

    let info = TrackInfo {
        path: path.to_path_buf(),
        file_sample_rate: reader.file_sample_rate(),
        channels: reader.channels(),
        frames,
    };
    let (source, feeder) = stream::stream_with_cues(head, cues, frames, Box::new(reader), stream::lookahead_blocks(sample_rate));
    Ok((source, feeder, info))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decode::tests::{temp_dir, write_wav};

    #[test]
    fn loads_files_and_plays_their_sum() {
        let dir = temp_dir("load");
        let drums: Vec<i16> = (0..9_000).map(|i| (i % 1_000) as i16 * 10).collect();
        let bass: Vec<i16> = (0..6_000).flat_map(|i| [-(i as i16), i as i16]).collect();
        write_wav(&dir.join("drums.wav"), 48_000, 1, &drums);
        write_wav(&dir.join("bass.wav"), 48_000, 2, &bass[..6_000 * 2]);

        let (mut engine, mut mixer) = new(48_000);
        let info = engine.load_files(&[dir.join("drums.wav"), dir.join("bass.wav")]).unwrap();
        assert_eq!(info.length, 9_000);
        assert_eq!(info.tracks[0].channels, 1);
        assert_eq!(info.tracks[1].frames, 6_000);
        assert_eq!((info.click_track, info.guide_track, info.timecode_track), (2, 3, 4));
        engine.send(Command::Play).unwrap();
        let out = mixer.render(9_000);

        let f = |s: i16| f32::from(s) / 32_768.0;
        for frame in [0, 1, 5_999, 6_000, 8_999] {
            let (bass_left, bass_right) =
                if frame < 6_000 { (f(bass[frame * 2]), f(bass[frame * 2 + 1])) } else { (0.0, 0.0) };
            assert_eq!(out[frame * CHANNELS], 0.0 + f(drums[frame]) + bass_left, "frame {frame}");
            assert_eq!(out[frame * CHANNELS + 1], 0.0 + f(drums[frame]) + bass_right, "frame {frame}");
        }
        assert_eq!(engine.state().underruns, 0);
    }

    #[test]
    fn song_documents_convert_positions_to_the_device_rate() {
        let dir = temp_dir("doc");
        write_wav(&dir.join("keys.wav"), 44_100, 1, &vec![1_000i16; 441_000]);
        let doc = SongDoc {
            sample_rate: 44_100,
            bpm: 120.0,
            time_signature: TimeSignature { numerator: 4, denominator: 4 },
            tempo_map: Vec::new(),
            tracks: vec![TrackDoc { file: dir.join("keys.wav"), kind: TrackRole::Stem, gain: 1.0, mute: false, bus: None }],
            sections: vec![SectionDoc { name: "Verse".into(), start_sample: 88_200, end_sample: 264_600 }],
            markers: vec![MarkerDoc { sample: 352_800, action: MarkerAction::Stop }],
            timecode_start: Some("03:00:00:00".into()),
        };
        let (mut engine, _mixer) = new(48_000);
        let Built { song, info, .. } = engine.build_job(&doc).run().unwrap();
        assert_eq!(info.length, 480_000);
        assert_eq!(song.section_at(100_000), Some(Span { start: 96_000, end: 288_000 }));
        assert_eq!(song.timeline.markers, vec![Marker { at: 384_000, action: MarkerAction::Stop }]);
        // Click on every beat at 48 kHz.
        // LTC starts at the song's own label, off by default.
        let Source::Timecode(ltc) = &song.tracks[info.timecode_track].source else { panic!("timecode track") };
        assert_eq!(ltc.timecode_at(0).to_string(), "03:00:00:00");
        assert!(song.tracks[info.timecode_track].muted);
        let Source::Sampler(click) = &song.tracks[info.click_track].source else { panic!("click is a sampler") };
        assert_eq!(click.hits()[1].at, 24_000);
    }
}
