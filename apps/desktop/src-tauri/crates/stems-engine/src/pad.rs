//! Pads: an ambient loop that plays under and between songs and crossfades when it changes.

use std::sync::Arc;

use crate::CHANNELS;

/// Seconds a pad takes to fade in, out or across.
pub const PAD_FADE_SECONDS: f64 = 2.0;
/// Frames blended at the loop seam so a loop that does not end at a zero crossing never clicks.
const SEAM_FRAMES: usize = 2_400;

#[derive(Debug)]
pub struct Pad {
    samples: Arc<[f32]>,
    position: usize,
}

impl Pad {
    /// A looped pad from stereo interleaved samples. The tail is blended into the head so the
    /// loop is seamless; the loop is then `len - seam` frames long.
    pub fn new(samples: &[f32]) -> Self {
        let frames = samples.len() / CHANNELS;
        let seam = SEAM_FRAMES.min(frames / 4);
        let looped = frames - seam;
        let mut out: Vec<f32> = samples[..looped * CHANNELS].to_vec();
        for frame in 0..seam {
            let t = (frame as f32 + 0.5) / seam as f32;
            let (fade_in, fade_out) = ((t * std::f32::consts::FRAC_PI_2).sin(), (t * std::f32::consts::FRAC_PI_2).cos());
            for channel in 0..CHANNELS {
                let head = samples[frame * CHANNELS + channel];
                let tail = samples[(looped + frame) * CHANNELS + channel];
                out[frame * CHANNELS + channel] = head * fade_in + tail * fade_out;
            }
        }
        Self { samples: out.into(), position: 0 }
    }

    pub fn frames(&self) -> usize {
        self.samples.len() / CHANNELS
    }

    /// Add the next frames to `mix`, each scaled by `gain(i)`.
    pub(crate) fn mix(&mut self, mix: &mut [f32], mut gain: impl FnMut(usize) -> f32) {
        let frames = self.frames();
        if frames == 0 {
            return;
        }
        for (index, out) in mix.chunks_exact_mut(CHANNELS).enumerate() {
            let g = gain(index);
            out[0] += self.samples[self.position * CHANNELS] * g;
            out[1] += self.samples[self.position * CHANNELS + 1] * g;
            self.position = (self.position + 1) % frames;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loops_without_a_jump_at_the_seam() {
        // A ramp from 0 to 1: unblended, the loop would jump from 1 back to 0.
        let frames = 20_000;
        let samples: Vec<f32> = (0..frames).flat_map(|i| {
            let v = i as f32 / frames as f32;
            [v, v]
        }).collect();
        let mut pad = Pad::new(&samples);
        let mut out = vec![0.0; pad.frames() * 2 * CHANNELS];
        pad.mix(&mut out, |_| 1.0);
        let left: Vec<f32> = out.iter().step_by(CHANNELS).copied().collect();
        let biggest = left.windows(2).map(|pair| (pair[1] - pair[0]).abs()).fold(0.0, f32::max);
        assert!(biggest < 0.01, "step {biggest}");
    }
}
