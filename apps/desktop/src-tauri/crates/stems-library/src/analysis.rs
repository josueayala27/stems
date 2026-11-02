//! Tempo analysis. BPM comes from the click track when there is one (onset intervals, sample
//! precise), otherwise from autocorrelation of an onset envelope summed over the stems. Every
//! value is a suggestion: the song editor can override it.

use serde::Serialize;

/// Hop of the onset envelope, in frames.
pub const HOP: usize = 512;
const MIN_BPM: f64 = 60.0;
const MAX_BPM: f64 = 200.0;
/// Click onsets: level that counts as a hit, and the shortest gap between two hits.
const CLICK_THRESHOLD: f32 = 0.1;
const CLICK_REFRACTORY_SECONDS: f64 = 0.06;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BpmSource {
    Click,
    Onsets,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tempo {
    pub bpm: f64,
    pub source: BpmSource,
}

/// Energy per hop of a mono mix of the input, streamed.
pub struct EnvelopeBuilder {
    energy: f32,
    in_hop: usize,
    values: Vec<f32>,
}

impl Default for EnvelopeBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl EnvelopeBuilder {
    pub fn new() -> Self {
        Self { energy: 0.0, in_hop: 0, values: Vec::new() }
    }

    pub fn push(&mut self, stereo: &[f32]) {
        for frame in stereo.chunks_exact(2) {
            let mono = 0.5 * (frame[0] + frame[1]);
            self.energy += mono * mono;
            self.in_hop += 1;
            if self.in_hop == HOP {
                self.values.push(self.energy / HOP as f32);
                self.energy = 0.0;
                self.in_hop = 0;
            }
        }
    }

    /// Hop energies. Sum several tracks' envelopes with [`add_envelopes`] before [`bpm_from_energy`].
    pub fn finish(self) -> Vec<f32> {
        self.values
    }
}

pub fn add_envelopes(into: &mut Vec<f32>, other: &[f32]) {
    if into.len() < other.len() {
        into.resize(other.len(), 0.0);
    }
    for (sum, value) in into.iter_mut().zip(other) {
        *sum += value;
    }
}

/// BPM from hop energies by autocorrelating the onset strength (rises in log energy).
pub fn bpm_from_energy(energy: &[f32], sample_rate: u32) -> Option<f64> {
    if energy.len() < 8 {
        return None;
    }
    let log: Vec<f32> = energy.iter().map(|&e| (1.0 + 1_000.0 * e).ln()).collect();
    let rises: Vec<f32> = log.windows(2).map(|pair| (pair[1] - pair[0]).max(0.0)).collect();
    // Light smoothing, so a beat between two hops does not split its peak.
    let mut onset: Vec<f32> = (0..rises.len())
        .map(|i| {
            let before = rises[i.saturating_sub(1)];
            let after = rises[(i + 1).min(rises.len() - 1)];
            0.25 * before + 0.5 * rises[i] + 0.25 * after
        })
        .collect();
    let mean = onset.iter().sum::<f32>() / onset.len() as f32;
    onset.iter_mut().for_each(|value| *value -= mean);

    let hops_per_second = f64::from(sample_rate) / HOP as f64;
    let lag_for = |bpm: f64| 60.0 * hops_per_second / bpm;
    let min_lag = lag_for(MAX_BPM).floor().max(1.0) as usize;
    let max_lag = (lag_for(MIN_BPM).ceil() as usize).min(onset.len() / 2);
    if max_lag <= min_lag + 2 {
        return None;
    }
    let correlate = |lag: usize| -> f64 {
        onset.iter().zip(&onset[lag..]).map(|(a, b)| f64::from(*a) * f64::from(*b)).sum::<f64>()
            / (onset.len() - lag) as f64
    };
    // Up to twice the longest lag, for the comb term below.
    let top = (2 * max_lag + 2).min(onset.len() - 1);
    let scores: Vec<f64> = (0..=top).map(|lag| if lag + 1 < min_lag { 0.0 } else { correlate(lag) }).collect();
    let at = |lag: usize| scores.get(lag).copied().unwrap_or(0.0);
    // Score a beat lag with its double too, so the beat beats its own subdivisions.
    // A log-normal prior around 120 BPM settles octave ambiguity, as most beat trackers do.
    let prior = |lag: usize| {
        let octaves = (60.0 * hops_per_second / lag as f64 / 120.0).log2();
        (-0.5 * (octaves / 0.6).powi(2)).exp()
    };
    let score = |lag: usize| {
        let double = at(2 * lag - 1).max(at(2 * lag)).max(at(2 * lag + 1));
        prior(lag) * (at(lag) + 0.5 * double)
    };
    let best = (min_lag..=max_lag).max_by(|&a, &b| score(a).total_cmp(&score(b)))?;
    if scores[best] <= 0.0 {
        return None;
    }
    // Parabolic interpolation around the best lag for sub-hop precision.
    let (left, centre, right) = (scores[best - 1], scores[best], scores[best + 1]);
    let denominator = left - 2.0 * centre + right;
    let shift = if denominator.abs() > f64::EPSILON { (0.5 * (left - right) / denominator).clamp(-0.5, 0.5) } else { 0.0 };
    let bpm = 60.0 * hops_per_second / (best as f64 + shift);
    Some((bpm * 10.0).round() / 10.0)
}

/// Sample-accurate click onsets, streamed.
pub struct ClickDetector {
    refractory: u64,
    frame: u64,
    last: Option<u64>,
    onsets: Vec<u64>,
}

impl ClickDetector {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            refractory: (CLICK_REFRACTORY_SECONDS * f64::from(sample_rate)) as u64,
            frame: 0,
            last: None,
            onsets: Vec::new(),
        }
    }

    pub fn push(&mut self, stereo: &[f32]) {
        for frame in stereo.chunks_exact(2) {
            let level = frame[0].abs().max(frame[1].abs());
            if level >= CLICK_THRESHOLD && self.last.is_none_or(|last| self.frame - last >= self.refractory) {
                self.onsets.push(self.frame);
                self.last = Some(self.frame);
            }
            self.frame += 1;
        }
    }

    pub fn onsets(&self) -> &[u64] {
        &self.onsets
    }

    /// BPM from the median beat interval, averaging the intervals near it. Rounded to 0.01.
    pub fn bpm(&self, sample_rate: u32) -> Option<f64> {
        let mut intervals: Vec<u64> = self.onsets.windows(2).map(|pair| pair[1] - pair[0]).collect();
        if intervals.len() < 3 {
            return None;
        }
        intervals.sort_unstable();
        let median = intervals[intervals.len() / 2] as f64;
        let near: Vec<f64> =
            intervals.iter().map(|&i| i as f64).filter(|&i| (i - median).abs() <= 0.05 * median).collect();
        let mean = near.iter().sum::<f64>() / near.len() as f64;
        let bpm = 60.0 * f64::from(sample_rate) / mean;
        (MIN_BPM / 2.0..=MAX_BPM * 2.0).contains(&bpm).then(|| (bpm * 100.0).round() / 100.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::click_samples;

    fn stereo(mono: &[i16]) -> Vec<f32> {
        mono.iter().flat_map(|&s| {
            let v = f32::from(s) / 32_768.0;
            [v, v]
        }).collect()
    }

    #[test]
    fn click_tracks_give_their_exact_tempo() {
        for bpm in [120.0, 97.5, 140.0, 72.0] {
            let samples = stereo(&click_samples(bpm, 48_000, 20.0));
            let mut detector = ClickDetector::new(48_000);
            for chunk in samples.chunks(1_000) {
                detector.push(chunk);
            }
            let found = detector.bpm(48_000).unwrap();
            assert!((found - bpm).abs() < 0.02, "{bpm} → {found}");
            // The burst starts at sin(0) = 0, so the hit is found a few samples in.
            assert!(detector.onsets()[0] < 10);
        }
    }

    #[test]
    fn silence_has_no_tempo() {
        let detector = ClickDetector::new(48_000);
        assert_eq!(detector.bpm(48_000), None);
        assert_eq!(bpm_from_energy(&[0.0; 1_000], 48_000), None);
    }

    /// Decaying noise hits, louder on the beat than on the off-beat, like a drum stem.
    fn drum_like(bpm: f64, sample_rate: u32, seconds: f64) -> Vec<f32> {
        let frames = (seconds * f64::from(sample_rate)) as usize;
        let half_beat = 30.0 * f64::from(sample_rate) / bpm;
        let mut seed = 1u32;
        let mut noise = move || {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (seed >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0
        };
        let mut out = vec![0.0; frames * 2];
        let mut hit = 0;
        loop {
            let start = (hit as f64 * half_beat) as usize;
            if start >= frames {
                return out;
            }
            let level = if hit % 2 == 0 { 0.8 } else { 0.3 };
            for offset in 0..4_000.min(frames - start) {
                let value = noise() * level * (-(offset as f32) / 800.0).exp();
                out[(start + offset) * 2] = value;
                out[(start + offset) * 2 + 1] = value;
            }
            hit += 1;
        }
    }

    #[test]
    fn onset_autocorrelation_finds_the_beat() {
        for bpm in [128.0, 90.0, 110.0] {
            let mut envelope = EnvelopeBuilder::new();
            envelope.push(&drum_like(bpm, 48_000, 30.0));
            let found = bpm_from_energy(&envelope.finish(), 48_000).unwrap();
            assert!((found - bpm).abs() < 1.0, "{bpm} → {found}");
        }
    }
}
