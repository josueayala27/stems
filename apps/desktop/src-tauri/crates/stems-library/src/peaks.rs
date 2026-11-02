//! Waveform peaks: min/max pairs at several zoom levels, computed once at import and stored as a
//! binary file, so the UI never decodes audio.
//!
//! File layout, little endian (`app/audio/peaks.ts` reads it):
//! ```text
//! "STPK"  u16 version = 1  u16 reserved
//! u32 sample_rate  u64 frames  u32 level_count
//! level_count × (u32 frames_per_peak, u32 peak_count)
//! for each level: peak_count × (i16 min, i16 max)
//! ```
//! Values are both channels together, scaled so ±1.0 is ±32767.

use std::path::Path;

use crate::LibraryError;

pub const MAGIC: &[u8; 4] = b"STPK";
pub const VERSION: u16 = 1;
/// Frames per peak at the finest level; each next level is `LEVEL_FACTOR` times coarser.
pub const BASE_FRAMES_PER_PEAK: u32 = 256;
pub const LEVEL_FACTOR: u32 = 4;
pub const LEVELS: usize = 5;

#[derive(Debug, Clone, PartialEq)]
pub struct Level {
    pub frames_per_peak: u32,
    /// (min, max) per peak.
    pub peaks: Vec<(i16, i16)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Peaks {
    pub sample_rate: u32,
    pub frames: u64,
    pub levels: Vec<Level>,
}

fn quantize(value: f32) -> i16 {
    (value.clamp(-1.0, 1.0) * 32_767.0).round() as i16
}

/// Streams stereo interleaved frames into the finest level.
pub struct PeakBuilder {
    sample_rate: u32,
    frames: u64,
    in_peak: u32,
    min: f32,
    max: f32,
    base: Vec<(i16, i16)>,
}

impl PeakBuilder {
    pub fn new(sample_rate: u32) -> Self {
        Self { sample_rate, frames: 0, in_peak: 0, min: f32::MAX, max: f32::MIN, base: Vec::new() }
    }

    pub fn push(&mut self, stereo: &[f32]) {
        for frame in stereo.chunks_exact(2) {
            self.min = self.min.min(frame[0]).min(frame[1]);
            self.max = self.max.max(frame[0]).max(frame[1]);
            self.in_peak += 1;
            self.frames += 1;
            if self.in_peak == BASE_FRAMES_PER_PEAK {
                self.close_peak();
            }
        }
    }

    fn close_peak(&mut self) {
        self.base.push((quantize(self.min), quantize(self.max)));
        self.in_peak = 0;
        self.min = f32::MAX;
        self.max = f32::MIN;
    }

    pub fn finish(mut self) -> Peaks {
        if self.in_peak > 0 {
            self.close_peak();
        }
        let mut levels = vec![Level { frames_per_peak: BASE_FRAMES_PER_PEAK, peaks: self.base }];
        for _ in 1..LEVELS {
            let previous = levels.last().expect("at least the base level");
            let peaks = previous
                .peaks
                .chunks(LEVEL_FACTOR as usize)
                .map(|group| {
                    group.iter().fold((i16::MAX, i16::MIN), |(low, high), &(min, max)| (low.min(min), high.max(max)))
                })
                .collect();
            levels.push(Level { frames_per_peak: previous.frames_per_peak * LEVEL_FACTOR, peaks });
        }
        Peaks { sample_rate: self.sample_rate, frames: self.frames, levels }
    }
}

impl Peaks {
    pub fn to_bytes(&self) -> Vec<u8> {
        let data: usize = self.levels.iter().map(|level| level.peaks.len() * 4).sum();
        let mut bytes = Vec::with_capacity(24 + self.levels.len() * 8 + data);
        bytes.extend_from_slice(MAGIC);
        bytes.extend_from_slice(&VERSION.to_le_bytes());
        bytes.extend_from_slice(&0u16.to_le_bytes());
        bytes.extend_from_slice(&self.sample_rate.to_le_bytes());
        bytes.extend_from_slice(&self.frames.to_le_bytes());
        bytes.extend_from_slice(&(self.levels.len() as u32).to_le_bytes());
        for level in &self.levels {
            bytes.extend_from_slice(&level.frames_per_peak.to_le_bytes());
            bytes.extend_from_slice(&(level.peaks.len() as u32).to_le_bytes());
        }
        for level in &self.levels {
            for &(min, max) in &level.peaks {
                bytes.extend_from_slice(&min.to_le_bytes());
                bytes.extend_from_slice(&max.to_le_bytes());
            }
        }
        bytes
    }

    pub fn from_bytes(bytes: &[u8]) -> crate::Result<Self> {
        let bad = |message: &str| LibraryError::BadPeaks(message.to_string());
        let take = |at: usize, len: usize| bytes.get(at..at + len).ok_or_else(|| bad("truncated"));
        let u16_at = |at| take(at, 2).map(|b| u16::from_le_bytes([b[0], b[1]]));
        let u32_at = |at| take(at, 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]));
        if take(0, 4)? != MAGIC {
            return Err(bad("not a peak file"));
        }
        if u16_at(4)? != VERSION {
            return Err(bad("unknown version"));
        }
        let sample_rate = u32_at(8)?;
        let frames = take(12, 8).map(|b| u64::from_le_bytes(b.try_into().expect("8 bytes")))?;
        let count = u32_at(20)? as usize;
        let mut headers = Vec::with_capacity(count);
        for index in 0..count {
            headers.push((u32_at(24 + index * 8)?, u32_at(28 + index * 8)? as usize));
        }
        let mut at = 24 + count * 8;
        let mut levels = Vec::with_capacity(count);
        for (frames_per_peak, peak_count) in headers {
            let data = take(at, peak_count * 4)?;
            let peaks = data
                .chunks_exact(4)
                .map(|b| (i16::from_le_bytes([b[0], b[1]]), i16::from_le_bytes([b[2], b[3]])))
                .collect();
            at += peak_count * 4;
            levels.push(Level { frames_per_peak, peaks });
        }
        Ok(Self { sample_rate, frames, levels })
    }

    pub fn write(&self, path: &Path) -> std::io::Result<()> {
        // Write then rename, so a crash never leaves a half-written peak file.
        let partial = path.with_extension("partial");
        std::fs::write(&partial, self.to_bytes())?;
        std::fs::rename(partial, path)
    }

    pub fn read(path: &Path) -> crate::Result<Self> {
        Self::from_bytes(&std::fs::read(path)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(frames: usize, value: impl Fn(usize) -> (f32, f32)) -> Peaks {
        let mut builder = PeakBuilder::new(48_000);
        let samples: Vec<f32> = (0..frames).flat_map(|i| {
            let (l, r) = value(i);
            [l, r]
        }).collect();
        // Pushed in odd chunks: peaks must not depend on how the decoder splits the audio.
        for chunk in samples.chunks(2 * 333) {
            builder.push(chunk);
        }
        builder.finish()
    }

    #[test]
    fn each_level_covers_the_whole_track() {
        let peaks = build(100_000, |i| ((i as f32 * 0.01).sin(), 0.0));
        assert_eq!(peaks.frames, 100_000);
        assert_eq!(peaks.levels.len(), LEVELS);
        for level in &peaks.levels {
            assert_eq!(level.peaks.len(), 100_000usize.div_ceil(level.frames_per_peak as usize));
        }
        assert_eq!(peaks.levels[4].frames_per_peak, 256 * 4 * 4 * 4 * 4);
    }

    #[test]
    fn peaks_hold_the_min_and_max_of_both_channels() {
        let peaks = build(512, |i| if i == 10 { (0.5, -0.25) } else if i == 300 { (-1.0, 1.0) } else { (0.0, 0.0) });
        assert_eq!(peaks.levels[0].peaks, vec![(-8_192, 16_384), (-32_767, 32_767)]);
        assert_eq!(peaks.levels[1].peaks, vec![(-32_767, 32_767)]);
    }

    #[test]
    fn round_trips_through_bytes() {
        let peaks = build(70_000, |i| ((i as f32).cos() * 0.3, (i as f32).sin() * 0.7));
        let bytes = peaks.to_bytes();
        assert_eq!(&bytes[..4], MAGIC);
        assert_eq!(Peaks::from_bytes(&bytes).unwrap(), peaks);
        assert!(Peaks::from_bytes(&bytes[..bytes.len() - 1]).is_err());
        assert!(Peaks::from_bytes(b"RIFF....").is_err());
    }
}
