//! Tempo map and quantize maths. Mirrors `createTempoGrid` and `nextQuantizeBoundary` in
//! `@stems/core` (packages/core/src/quantize.ts) so the UI and the engine agree on every boundary.
//! Built on the control thread; the real-time thread only reads it.

/// A tempo change, at the device rate.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TempoPoint {
    pub sample: u64,
    pub bpm: f64,
    pub numerator: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Segment {
    start: u64,
    end: u64,
    samples_per_beat: f64,
    numerator: u32,
    /// 0-based bar where the segment starts.
    start_bar: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unit {
    Beat,
    Bar,
}

/// One click or count: where it falls and its place in the bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tick {
    pub sample: u64,
    /// 0-based beat in the bar; 0 is the downbeat.
    pub beat: u32,
    /// 0 on the beat; 1.. for subdivisions between beats.
    pub subdivision: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TempoMap {
    segments: Vec<Segment>,
}

impl TempoMap {
    /// `points` may be empty or start after 0; the song tempo then applies from 0.
    pub fn new(sample_rate: u32, bpm: f64, numerator: u32, points: &[TempoPoint]) -> Self {
        let mut points: Vec<TempoPoint> = points.iter().copied().filter(|p| p.bpm > 0.0).collect();
        points.sort_by_key(|point| point.sample);
        if points.first().is_none_or(|first| first.sample != 0) {
            points.insert(0, TempoPoint { sample: 0, bpm: bpm.max(1.0), numerator: numerator.max(1) });
        }
        let mut segments = Vec::with_capacity(points.len());
        let mut start_bar = 0u64;
        for (index, point) in points.iter().enumerate() {
            let next = points.get(index + 1);
            let samples_per_beat = f64::from(sample_rate) * 60.0 / point.bpm;
            let numerator = point.numerator.max(1);
            segments.push(Segment {
                start: point.sample,
                end: next.map_or(u64::MAX, |next| next.sample),
                samples_per_beat,
                numerator,
                start_bar,
            });
            if let Some(next) = next {
                let bars = (next.sample - point.sample) as f64 / samples_per_beat / f64::from(numerator);
                start_bar += bars.round() as u64;
            }
        }
        Self { segments }
    }

    fn segment_at(&self, sample: u64) -> &Segment {
        let index = self.segments.partition_point(|segment| segment.start <= sample);
        &self.segments[index.saturating_sub(1)]
    }

    /// Samples in one beat and one bar at `sample`.
    pub fn beat_length(&self, sample: u64) -> f64 {
        self.segment_at(sample).samples_per_beat
    }

    pub fn bar_length(&self, sample: u64) -> f64 {
        let segment = self.segment_at(sample);
        segment.samples_per_beat * f64::from(segment.numerator)
    }

    pub fn numerator(&self, sample: u64) -> u32 {
        self.segment_at(sample).numerator
    }

    /// The next beat or bar line strictly after `sample`, capped at the next tempo change.
    pub fn next_line(&self, sample: u64, unit: Unit) -> u64 {
        let segment = self.segment_at(sample);
        let step = match unit {
            Unit::Beat => segment.samples_per_beat,
            Unit::Bar => segment.samples_per_beat * f64::from(segment.numerator),
        };
        let offset = (sample - segment.start) as f64;
        let steps = (offset / step + 1e-9).floor() + 1.0;
        let candidate = (segment.start as f64 + steps * step).round() as u64;
        candidate.min(segment.end)
    }

    /// The bar line at or before `sample`.
    pub fn bar_start(&self, sample: u64) -> u64 {
        let segment = self.segment_at(sample);
        let bar = segment.samples_per_beat * f64::from(segment.numerator);
        let bars = ((sample - segment.start) as f64 / bar + 1e-9).floor();
        (segment.start as f64 + bars * bar).round() as u64
    }

    /// Every beat (and `subdivisions - 1` ticks between beats) from 0 to `length`.
    pub fn ticks(&self, length: u64, subdivisions: u32) -> Vec<Tick> {
        let subdivisions = subdivisions.max(1);
        let mut ticks = Vec::new();
        for segment in &self.segments {
            if segment.start >= length {
                break;
            }
            let end = segment.end.min(length);
            let step = segment.samples_per_beat / f64::from(subdivisions);
            let mut index = 0u64;
            loop {
                let sample = (segment.start as f64 + index as f64 * step).round() as u64;
                if sample >= end {
                    break;
                }
                let beat_index = index / u64::from(subdivisions);
                ticks.push(Tick {
                    sample,
                    beat: (beat_index % u64::from(segment.numerator)) as u32,
                    subdivision: (index % u64::from(subdivisions)) as u32,
                });
                index += 1;
            }
        }
        ticks
    }
}

/// Where a quantized command lands. Matches `QuantizeTarget` in `@stems/core`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Quantize {
    Now,
    Beat,
    Bar,
    /// The end of the section under the play head, or the next bar outside any section.
    Section,
    /// The song end.
    End,
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    #[test]
    fn grid_lines_match_the_core_package() {
        // 120 bpm 4/4: a beat is 24 000 samples, a bar 96 000.
        let map = TempoMap::new(RATE, 120.0, 4, &[]);
        assert_eq!(map.next_line(0, Unit::Beat), 24_000);
        assert_eq!(map.next_line(24_000, Unit::Beat), 48_000);
        assert_eq!(map.next_line(1_000, Unit::Bar), 96_000);
        assert_eq!(map.next_line(96_000, Unit::Bar), 192_000);
        assert_eq!(map.bar_start(150_000), 96_000);
    }

    #[test]
    fn tempo_changes_restart_the_grid_and_cap_lines() {
        // 4 bars of 120 then 90 bpm in 3/4 from sample 384 000.
        let map = TempoMap::new(RATE, 120.0, 4, &[TempoPoint { sample: 384_000, bpm: 90.0, numerator: 3 }]);
        assert_eq!(map.next_line(380_000, Unit::Bar), 384_000);
        assert_eq!(map.next_line(384_000, Unit::Beat), 384_000 + 32_000);
        assert_eq!(map.next_line(384_000, Unit::Bar), 384_000 + 96_000);
        assert_eq!(map.numerator(400_000), 3);
    }

    #[test]
    fn ticks_follow_the_tempo_map() {
        let map = TempoMap::new(RATE, 120.0, 2, &[TempoPoint { sample: 96_000, bpm: 60.0, numerator: 2 }]);
        let ticks = map.ticks(240_000, 1);
        let samples: Vec<u64> = ticks.iter().map(|tick| tick.sample).collect();
        assert_eq!(samples, [0, 24_000, 48_000, 72_000, 96_000, 144_000, 192_000]);
        let beats: Vec<u32> = ticks.iter().map(|tick| tick.beat).collect();
        assert_eq!(beats, [0, 1, 0, 1, 0, 1, 0]);

        let eighths = TempoMap::new(RATE, 120.0, 4, &[]).ticks(48_000, 2);
        assert_eq!(eighths.iter().map(|t| (t.sample, t.subdivision)).collect::<Vec<_>>(), [(0, 0), (12_000, 1), (24_000, 0), (36_000, 1)]);
    }
}
