//! A one-shot sampler for generated tracks (click, guide, count-in). Rendering is a pure function
//! of the song position, so seeks, jumps and crossfades need no state and offline renders are exact.

use std::sync::Arc;

use crate::CHANNELS;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hit {
    pub at: u64,
    pub sound: u16,
    pub gain: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Sampler {
    /// Mono sounds at the device rate.
    sounds: Vec<Arc<[f32]>>,
    /// Sorted by `at`.
    hits: Vec<Hit>,
    longest: u64,
    length: u64,
}

impl Sampler {
    /// `length` is the track length in frames (the song length).
    pub fn new(sounds: Vec<Arc<[f32]>>, mut hits: Vec<Hit>, length: u64) -> Self {
        hits.retain(|hit| usize::from(hit.sound) < sounds.len());
        hits.sort_by_key(|hit| hit.at);
        let longest = sounds.iter().map(|sound| sound.len() as u64).max().unwrap_or(0);
        Self { sounds, hits, longest, length }
    }

    pub fn hits(&self) -> &[Hit] {
        &self.hits
    }

    pub fn length(&self) -> u64 {
        self.length
    }

    /// Write the frames from `position` into `out` (stereo interleaved, overwritten).
    pub fn read(&self, position: u64, out: &mut [f32]) {
        out.fill(0.0);
        let frames = (out.len() / CHANNELS) as u64;
        let end = position + frames;
        // First hit still sounding at `position`: `at + longest` is sorted because `at` is.
        let first = self.hits.partition_point(|hit| hit.at + self.longest <= position);
        for hit in &self.hits[first..] {
            if hit.at >= end {
                break;
            }
            let sound = &self.sounds[usize::from(hit.sound)];
            let sound_end = hit.at + sound.len() as u64;
            let from = hit.at.max(position);
            let to = sound_end.min(end);
            for frame in from..to {
                let value = sound[(frame - hit.at) as usize] * hit.gain;
                let index = (frame - position) as usize * CHANNELS;
                out[index] += value;
                out[index + 1] += value;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_hits_at_their_sample_across_block_edges() {
        let sampler = Sampler::new(
            vec![Arc::from(vec![1.0, 0.5, 0.25]), Arc::from(vec![-1.0])],
            vec![Hit { at: 9, sound: 0, gain: 1.0 }, Hit { at: 4, sound: 1, gain: 0.5 }, Hit { at: 10, sound: 0, gain: 2.0 }],
            100,
        );
        let mut first = [0.0; 10 * 2];
        sampler.read(0, &mut first);
        let left: Vec<f32> = first.iter().step_by(2).copied().collect();
        assert_eq!(left, [0.0, 0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, 0.0, 1.0]);
        let mut second = [0.0; 4 * 2];
        sampler.read(10, &mut second);
        let left: Vec<f32> = second.iter().step_by(2).copied().collect();
        // The hit at 9 rings into this block and overlaps the hit at 10.
        assert_eq!(left, [0.5 + 2.0, 0.25 + 1.0, 0.5, 0.0]);
    }

    #[test]
    fn drops_hits_for_unknown_sounds() {
        let sampler = Sampler::new(vec![Arc::from(vec![1.0])], vec![Hit { at: 0, sound: 3, gain: 1.0 }], 10);
        assert!(sampler.hits().is_empty());
    }
}
