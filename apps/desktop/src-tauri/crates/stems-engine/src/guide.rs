//! Spoken guide cues: the section name on the downbeat of the bar before each section, then
//! "two, three, four" on the following beats. Voices are WAV files the user provides (Stems ships
//! no third-party content): `<name>.wav` per section name and `2.wav` … `8.wav` for counts.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::decode::FileReader;
use crate::sampler::{Hit, Sampler};
use crate::stream::FrameReader;
use crate::tempo::TempoMap;
use crate::CHANNELS;

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GuideOptions {
    pub enabled: bool,
    /// Folder of voice files. `None` turns the guide off.
    pub voices: Option<PathBuf>,
    pub gain: f32,
    /// Speak "two, three, four" after the section name.
    pub count: bool,
}

impl Default for GuideOptions {
    fn default() -> Self {
        Self { enabled: true, voices: None, gain: 0.8, count: true }
    }
}

/// A section start the guide announces, at the device rate.
#[derive(Debug, Clone, PartialEq)]
pub struct Cue {
    pub name: String,
    pub start: u64,
}

/// Voice samples by normalized name.
#[derive(Debug, Clone, Default)]
pub struct Voices {
    sounds: Vec<Arc<[f32]>>,
    names: HashMap<String, u16>,
}

/// "Pre-Chorus 2" → "prechorus": lowercase letters only, trailing numbers dropped, so numbered
/// repeats of a section share a voice.
pub fn normalize(name: &str) -> String {
    let lower: String = name.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect();
    let trimmed = lower.trim_end_matches(|c: char| c.is_ascii_digit());
    if trimmed.is_empty() {
        lower
    } else {
        trimmed.to_string()
    }
}

fn decode_mono(path: &Path, sample_rate: u32) -> Option<Arc<[f32]>> {
    let mut reader = FileReader::open(path, sample_rate).ok()?;
    let mut stereo = vec![0.0; 4_096 * CHANNELS];
    let mut mono = Vec::new();
    loop {
        let frames = reader.read(&mut stereo);
        if frames == 0 {
            break;
        }
        mono.extend(stereo[..frames * CHANNELS].chunks_exact(CHANNELS).map(|f| 0.5 * (f[0] + f[1])));
    }
    (!mono.is_empty()).then(|| mono.into())
}

impl Voices {
    /// Load every audio file in `folder`, keyed by its normalized file stem. Unreadable files are skipped.
    pub fn load(folder: &Path, sample_rate: u32) -> Self {
        let mut voices = Self::default();
        let Ok(entries) = std::fs::read_dir(folder) else { return voices };
        let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
        paths.sort();
        for path in paths {
            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else { continue };
            let key = if stem.chars().all(|c| c.is_ascii_digit()) { stem.to_string() } else { normalize(stem) };
            if voices.names.contains_key(&key) {
                continue;
            }
            if let Some(sound) = decode_mono(&path, sample_rate) {
                voices.names.insert(key, voices.sounds.len() as u16);
                voices.sounds.push(sound);
            }
        }
        voices
    }

    pub fn from_sounds(named: Vec<(&str, Arc<[f32]>)>) -> Self {
        let mut voices = Self::default();
        for (name, sound) in named {
            voices.names.insert(name.to_string(), voices.sounds.len() as u16);
            voices.sounds.push(sound);
        }
        voices
    }

    pub fn is_empty(&self) -> bool {
        self.sounds.is_empty()
    }

    fn get(&self, key: &str) -> Option<u16> {
        self.names.get(key).copied()
    }
}

/// The guide track: each cue's voice on the downbeat of the bar before its section.
pub fn guide_track(map: &TempoMap, cues: &[Cue], voices: &Voices, options: &GuideOptions, length: u64) -> Sampler {
    let mut hits = Vec::new();
    for cue in cues {
        let Some(sound) = voices.get(&normalize(&cue.name)) else { continue };
        if cue.start == 0 {
            continue;
        }
        let before = cue.start - 1;
        let bar = map.bar_start(before);
        hits.push(Hit { at: bar, sound, gain: 1.0 });
        if options.count {
            let beat = map.beat_length(bar);
            for count in 2..=map.numerator(bar).min(8) {
                if let Some(number) = voices.get(&count.to_string()) {
                    let at = bar + (beat * f64::from(count - 1)).round() as u64;
                    if at < cue.start {
                        hits.push(Hit { at, sound: number, gain: 1.0 });
                    }
                }
            }
        }
    }
    Sampler::new(voices.sounds.clone(), hits, length)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn voice() -> Arc<[f32]> {
        Arc::from(vec![0.5; 10])
    }

    #[test]
    fn names_share_voices_across_numbering_and_spelling() {
        assert_eq!(normalize("Chorus 2"), "chorus");
        assert_eq!(normalize("Pre-Chorus"), "prechorus");
        assert_eq!(normalize("VERSE"), "verse");
        assert_eq!(normalize("123"), "123");
    }

    #[test]
    fn cues_land_one_bar_before_each_section_with_counts() {
        let map = TempoMap::new(48_000, 120.0, 4, &[]);
        let voices = Voices::from_sounds(vec![("verse", voice()), ("chorus", voice()), ("2", voice()), ("3", voice()), ("4", voice())]);
        let cues = [
            Cue { name: "Intro".into(), start: 0 },
            Cue { name: "Verse 1".into(), start: 192_000 },
            Cue { name: "Chorus".into(), start: 384_000 },
            Cue { name: "Bridge".into(), start: 576_000 },
        ];
        let track = guide_track(&map, &cues, &voices, &GuideOptions::default(), 700_000);
        let hits: Vec<(u64, u16)> = track.hits().iter().map(|hit| (hit.at, hit.sound)).collect();
        // Verse at bar 3 (192 000): voice at 96 000, counts at 120 000, 144 000, 168 000. No bridge voice.
        assert_eq!(
            hits,
            [(96_000, 0), (120_000, 2), (144_000, 3), (168_000, 4), (288_000, 1), (312_000, 2), (336_000, 3), (360_000, 4)]
        );
    }

    #[test]
    fn counting_can_be_turned_off() {
        let map = TempoMap::new(48_000, 120.0, 4, &[]);
        let voices = Voices::from_sounds(vec![("chorus", voice()), ("2", voice())]);
        let options = GuideOptions { count: false, ..GuideOptions::default() };
        let track = guide_track(&map, &[Cue { name: "Chorus".into(), start: 96_000 }], &voices, &options, 200_000);
        assert_eq!(track.hits().len(), 1);
    }
}
