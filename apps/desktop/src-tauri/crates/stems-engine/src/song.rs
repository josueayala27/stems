//! A song as the mixer holds it: tracks plus the timeline (tempo map, sections, markers, count-in).
//! Built on the control thread; nothing in it grows on the real-time thread.

use std::sync::Arc;

use stems_control::MidiMessage;

use serde::{Deserialize, Serialize};

use crate::meter::Meter;
use crate::ramp::Ramp;
use crate::routing::Routing;
use crate::sampler::Sampler;
use crate::source::Source;
use crate::tempo::{Quantize, TempoMap, Unit};
use crate::{EngineError, CHANNELS, MAX_TRACKS};

/// Longest jump crossfade in frames (5 ms at 192 kHz).
pub const MAX_FADE: usize = 1_024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TrackRole {
    Stem,
    Click,
    Guide,
    /// Generated LTC. Never crossfaded: a blend of two timecodes decodes as neither.
    Timecode,
}

#[derive(Debug)]
pub struct TrackSpec {
    pub source: Source,
    pub role: TrackRole,
    pub gain: f32,
    pub muted: bool,
    /// Bus index in the rig. `None`, or a bus the rig lacks, plays into the role's bus.
    pub bus: Option<usize>,
    /// Source frames skipped before song frame 0 (the song's start point). 0 for generated tracks.
    pub offset: u64,
}

impl TrackSpec {
    pub fn stem(source: Source) -> Self {
        Self { source, role: TrackRole::Stem, gain: 1.0, muted: false, bus: None, offset: 0 }
    }

    pub fn with_role(source: Source, role: TrackRole, gain: f32) -> Self {
        Self { source, role, gain, muted: false, bus: None, offset: 0 }
    }
}

#[derive(Debug)]
pub struct Track {
    pub(crate) source: Source,
    pub(crate) role: TrackRole,
    pub(crate) gain: f32,
    pub(crate) muted: bool,
    pub(crate) soloed: bool,
    pub(crate) bus: Option<usize>,
    pub(crate) offset: u64,
    pub(crate) ramp: Ramp,
    pub(crate) meter: Meter,
    /// The old position's audio during a jump crossfade.
    pub(crate) fade: Box<[f32]>,
}

impl Track {
    fn new(spec: TrackSpec) -> Self {
        let gain = if spec.gain.is_finite() { spec.gain.max(0.0) } else { 0.0 };
        let start = if spec.muted { 0.0 } else { gain };
        Self {
            source: spec.source,
            role: spec.role,
            gain,
            muted: spec.muted,
            soloed: false,
            bus: spec.bus,
            offset: spec.offset,
            ramp: Ramp::new(start),
            meter: Meter::default(),
            fade: vec![0.0; MAX_FADE * CHANNELS].into_boxed_slice(),
        }
    }

    /// Read the frames that start at song frame `position` (source frame `position + offset`).
    #[inline]
    pub(crate) fn read(&mut self, position: u64, out: &mut [f32]) -> bool {
        self.source.read(position + self.offset, out)
    }

    pub(crate) fn seek(&mut self, position: u64) {
        self.source.seek(position + self.offset);
    }

    /// The bus this track plays into under `routing`. Timecode with no timecode bus plays
    /// nowhere: LTC must never fall back to a bus the audience hears.
    #[inline]
    pub(crate) fn bus(&self, routing: &Routing) -> Option<usize> {
        let role = match self.role {
            TrackRole::Stem => routing.roles.stem,
            TrackRole::Click => routing.roles.click,
            TrackRole::Guide => routing.roles.guide,
            TrackRole::Timecode => return routing.roles.timecode,
        };
        Some(routing.resolve(self.bus, role))
    }

    /// Click and guide ignore solo: soloing a stem never silences the click.
    pub(crate) fn target(&self, any_solo: bool) -> f32 {
        let solo_ok = !any_solo || self.soloed || self.role != TrackRole::Stem;
        if !self.muted && solo_ok {
            self.gain
        } else {
            0.0
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: u64,
    pub end: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MarkerAction {
    None,
    /// Stop at the marker.
    Stop,
    /// Vamp the section under the marker until released.
    Loop,
    /// End the song here and run the setlist transition.
    Next,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Marker {
    pub at: u64,
    pub action: MarkerAction,
}

/// A MIDI message at a song frame (a cue event).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SongEvent {
    pub at: u64,
    pub message: MidiMessage,
}

/// Everything about a song except its audio, at the device rate.
#[derive(Debug, Clone)]
pub struct Timeline {
    pub tempo: TempoMap,
    pub sections: Vec<Span>,
    pub markers: Vec<Marker>,
    pub count_in: Option<(Arc<Sampler>, u64)>,
    /// Sorted by `at` (stable, so messages at one frame keep their order).
    pub events: Vec<SongEvent>,
}

impl Timeline {
    pub fn plain(sample_rate: u32) -> Self {
        Self { tempo: TempoMap::new(sample_rate, 120.0, 4, &[]), sections: Vec::new(), markers: Vec::new(), count_in: None, events: Vec::new() }
    }
}

#[derive(Debug)]
pub struct Song {
    pub(crate) tag: u64,
    pub(crate) tracks: Vec<Track>,
    pub(crate) length: u64,
    pub(crate) timeline: Timeline,
}

impl Song {
    /// Stems only, 120 bpm, no sections: tests and simple playback.
    pub fn new(sources: Vec<Source>) -> crate::Result<Self> {
        Self::build(0, sources.into_iter().map(TrackSpec::stem).collect(), Timeline::plain(48_000))
    }

    pub fn build(tag: u64, specs: Vec<TrackSpec>, mut timeline: Timeline) -> crate::Result<Self> {
        if specs.len() > MAX_TRACKS {
            return Err(EngineError::TooManyTracks(specs.len()));
        }
        let length = specs.iter().map(|spec| spec.source.frames().saturating_sub(spec.offset)).max().unwrap_or(0);
        timeline.sections.retain(|span| span.end > span.start);
        timeline.sections.sort_by_key(|span| span.start);
        timeline.markers.retain(|marker| marker.action != MarkerAction::None && marker.at < length);
        timeline.markers.sort_by_key(|marker| marker.at);
        timeline.events.sort_by_key(|event| event.at);
        Ok(Self { tag, tracks: specs.into_iter().map(Track::new).collect(), length, timeline })
    }

    pub fn tag(&self) -> u64 {
        self.tag
    }

    pub fn length(&self) -> u64 {
        self.length
    }

    pub fn track_count(&self) -> usize {
        self.tracks.len()
    }

    pub(crate) fn click_index(&self) -> Option<usize> {
        self.tracks.iter().position(|track| track.role == TrackRole::Click)
    }

    /// The section under `position`.
    pub fn section_at(&self, position: u64) -> Option<Span> {
        let index = self.timeline.sections.partition_point(|span| span.start <= position);
        self.timeline.sections[..index].iter().rev().find(|span| position < span.end).copied()
    }

    /// The section under `position`, or the bar under it outside any section.
    pub fn loop_span(&self, position: u64) -> Span {
        self.section_at(position).unwrap_or_else(|| {
            let start = self.timeline.tempo.bar_start(position);
            Span { start, end: self.timeline.tempo.next_line(position, Unit::Bar) }
        })
    }

    /// Where a command issued at `position` takes effect. Matches `nextQuantizeBoundary`.
    pub fn boundary(&self, position: u64, quantize: Quantize) -> u64 {
        let tempo = &self.timeline.tempo;
        let at = match quantize {
            Quantize::Now => position,
            Quantize::Beat => tempo.next_line(position, Unit::Beat),
            Quantize::Bar => tempo.next_line(position, Unit::Bar),
            Quantize::Section => self.section_at(position).map_or_else(|| tempo.next_line(position, Unit::Bar), |span| span.end),
            Quantize::End => self.length.max(position),
        };
        at.min(self.length.max(position))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn song(sections: Vec<Span>) -> Song {
        let timeline = Timeline { sections, ..Timeline::plain(48_000) };
        Song::build(1, vec![TrackSpec::stem(Source::memory(vec![0.0; 960_000 * 2]))], timeline).unwrap()
    }

    #[test]
    fn quantize_targets_match_the_core_package() {
        let song = song(vec![Span { start: 0, end: 192_000 }, Span { start: 192_000, end: 384_000 }]);
        assert_eq!(song.boundary(1_000, Quantize::Now), 1_000);
        assert_eq!(song.boundary(1_000, Quantize::Beat), 24_000);
        assert_eq!(song.boundary(1_000, Quantize::Bar), 96_000);
        assert_eq!(song.boundary(1_000, Quantize::Section), 192_000);
        assert_eq!(song.boundary(200_000, Quantize::Section), 384_000);
        // Outside any section, `section` is the next bar.
        assert_eq!(song.boundary(400_000, Quantize::Section), 480_000);
        assert_eq!(song.boundary(1_000, Quantize::End), 960_000);
    }

    #[test]
    fn loop_spans_are_the_section_or_the_bar() {
        let song = song(vec![Span { start: 96_000, end: 288_000 }]);
        assert_eq!(song.loop_span(100_000), Span { start: 96_000, end: 288_000 });
        assert_eq!(song.loop_span(10_000), Span { start: 0, end: 96_000 });
    }

    #[test]
    fn solo_never_silences_click_or_guide() {
        let click = Track::new(TrackSpec::with_role(Source::memory(vec![]), TrackRole::Click, 0.7));
        let stem = Track::new(TrackSpec::stem(Source::memory(vec![])));
        assert_eq!(click.target(true), 0.7);
        assert_eq!(stem.target(true), 0.0);
    }
}
