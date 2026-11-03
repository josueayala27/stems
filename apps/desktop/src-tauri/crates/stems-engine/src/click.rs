//! The click, generated from the tempo map: accented downbeat, optional subdivisions, count-in,
//! and a choice of synthesized sounds (no samples to license).

use std::f32::consts::TAU;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::sampler::{Hit, Sampler};
use crate::tempo::TempoMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ClickSound {
    #[default]
    Beep,
    Tick,
    Wood,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClickOptions {
    pub enabled: bool,
    pub sound: ClickSound,
    /// 1 = beats only, 2 = eighths, 4 = sixteenths (of the beat unit).
    pub subdivisions: u32,
    /// Bars of click before the song starts when playing from the top. 0 is off.
    pub count_in_bars: u32,
    /// Linear gain of the click track.
    pub gain: f32,
}

impl Default for ClickOptions {
    fn default() -> Self {
        Self { enabled: true, sound: ClickSound::Beep, subdivisions: 1, count_in_bars: 1, gain: 0.8 }
    }
}

const ACCENT: u16 = 0;
const BEAT: u16 = 1;
const SUBDIVISION: u16 = 2;

fn tone(sample_rate: u32, frequency: f32, seconds: f32, decay: f32) -> Arc<[f32]> {
    let frames = (seconds * sample_rate as f32) as usize;
    (0..frames)
        .map(|i| {
            let t = i as f32 / sample_rate as f32;
            // 1 ms attack avoids a click of its own.
            let attack = (t / 0.001).min(1.0);
            (TAU * frequency * t).sin() * attack * (-t / decay).exp()
        })
        .collect()
}

fn wood(sample_rate: u32, frequency: f32) -> Arc<[f32]> {
    let frames = (0.04 * sample_rate as f32) as usize;
    (0..frames)
        .map(|i| {
            let t = i as f32 / sample_rate as f32;
            let attack = (t / 0.0005).min(1.0);
            let body = (TAU * frequency * t).sin() + 0.5 * (TAU * frequency * 2.76 * t).sin();
            0.7 * body * attack * (-t / 0.008).exp()
        })
        .collect()
}

/// Accent, beat and subdivision sounds at `sample_rate`.
pub fn sounds(sound: ClickSound, sample_rate: u32) -> Vec<Arc<[f32]>> {
    match sound {
        ClickSound::Beep => vec![
            tone(sample_rate, 1_600.0, 0.05, 0.015),
            tone(sample_rate, 1_000.0, 0.05, 0.015),
            tone(sample_rate, 1_000.0, 0.03, 0.008),
        ],
        ClickSound::Tick => vec![
            tone(sample_rate, 3_200.0, 0.02, 0.004),
            tone(sample_rate, 2_400.0, 0.02, 0.004),
            tone(sample_rate, 2_400.0, 0.015, 0.003),
        ],
        ClickSound::Wood => vec![wood(sample_rate, 1_200.0), wood(sample_rate, 800.0), wood(sample_rate, 800.0)],
    }
}

fn hit_for(beat: u32, subdivision: u32) -> Hit {
    match (beat, subdivision) {
        (0, 0) => Hit { at: 0, sound: ACCENT, gain: 1.0 },
        (_, 0) => Hit { at: 0, sound: BEAT, gain: 0.8 },
        _ => Hit { at: 0, sound: SUBDIVISION, gain: 0.45 },
    }
}

/// The click track for a song of `length` frames.
pub fn click_track(map: &TempoMap, length: u64, options: &ClickOptions, sample_rate: u32) -> Sampler {
    let hits = map
        .ticks(length, options.subdivisions)
        .into_iter()
        .map(|tick| Hit { at: tick.sample, ..hit_for(tick.beat, tick.subdivision) })
        .collect();
    Sampler::new(sounds(options.sound, sample_rate), hits, length)
}

/// The count-in: `bars` bars at the song's opening tempo. Returns the sampler and its length.
pub fn count_in(map: &TempoMap, options: &ClickOptions, sample_rate: u32) -> Option<(Sampler, u64)> {
    if options.count_in_bars == 0 {
        return None;
    }
    let bar = map.bar_length(0);
    let length = (bar * f64::from(options.count_in_bars)).round() as u64;
    let opening = TempoMap::new(sample_rate, 60.0 * f64::from(sample_rate) / map.beat_length(0), map.numerator(0), &[]);
    let hits = opening
        .ticks(length, 1)
        .into_iter()
        .map(|tick| Hit { at: tick.sample, ..hit_for(tick.beat, 0) })
        .collect();
    Some((Sampler::new(sounds(options.sound, sample_rate), hits, length), length))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn click_hits_land_on_every_beat_with_an_accent_on_the_downbeat() {
        let map = TempoMap::new(48_000, 120.0, 4, &[]);
        let click = click_track(&map, 192_000, &ClickOptions::default(), 48_000);
        let hits: Vec<(u64, u16)> = click.hits().iter().map(|hit| (hit.at, hit.sound)).collect();
        assert_eq!(
            hits,
            [(0, 0), (24_000, 1), (48_000, 1), (72_000, 1), (96_000, 0), (120_000, 1), (144_000, 1), (168_000, 1)]
        );
    }

    #[test]
    fn rendered_click_starts_exactly_on_the_beat() {
        let map = TempoMap::new(48_000, 100.0, 4, &[]);
        let click = click_track(&map, 100_000, &ClickOptions::default(), 48_000);
        let beat = 28_800;
        let mut out = vec![0.0; 2 * 64];
        click.read(beat - 32, &mut out);
        // Silence before the beat; sound from the beat on (the 1 ms attack starts at 0).
        assert!(out[..32 * 2].iter().all(|&s| s == 0.0));
        assert!(out[34 * 2..].iter().any(|&s| s != 0.0));
    }

    #[test]
    fn subdivisions_are_quieter_ticks_between_beats() {
        let map = TempoMap::new(48_000, 120.0, 4, &[]);
        let options = ClickOptions { subdivisions: 2, ..ClickOptions::default() };
        let click = click_track(&map, 48_000, &options, 48_000);
        let hits: Vec<(u64, u16)> = click.hits().iter().map(|hit| (hit.at, hit.sound)).collect();
        assert_eq!(hits, [(0, 0), (12_000, 2), (24_000, 1), (36_000, 2)]);
    }

    #[test]
    fn count_in_is_whole_bars_at_the_opening_tempo() {
        let map = TempoMap::new(48_000, 120.0, 3, &[]);
        let (sampler, length) = count_in(&map, &ClickOptions { count_in_bars: 2, ..ClickOptions::default() }, 48_000).unwrap();
        assert_eq!(length, 144_000);
        assert_eq!(sampler.hits().len(), 6);
        assert_eq!(sampler.hits()[3].at, 72_000);
        assert_eq!(sampler.hits()[3].sound, 0);
        assert!(count_in(&map, &ClickOptions { count_in_bars: 0, ..ClickOptions::default() }, 48_000).is_none());
    }
}
