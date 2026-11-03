use std::sync::Arc;

use crate::sampler::Sampler;
use crate::stream::StreamSource;
use crate::CHANNELS;

/// The audio of one track, read by the real-time thread at the play head.
#[derive(Debug)]
pub enum Source {
    /// Whole track in memory (tests, short files, generated audio).
    Memory(MemorySource),
    /// Head in memory, the rest streamed from disk.
    Stream(StreamSource),
    /// Generated one-shots: click, guide.
    Sampler(Arc<Sampler>),
}

impl Source {
    /// Stereo interleaved samples at the device rate.
    pub fn memory(samples: impl Into<Arc<[f32]>>) -> Self {
        Self::Memory(MemorySource { samples: samples.into() })
    }

    /// Length in frames at the device rate.
    pub fn frames(&self) -> u64 {
        match self {
            Self::Memory(source) => (source.samples.len() / CHANNELS) as u64,
            Self::Stream(source) => source.frames(),
            Self::Sampler(sampler) => sampler.length(),
        }
    }

    /// Tell the source the play head moved to `position`. Streams ask their disk thread to refill.
    pub fn seek(&mut self, position: u64) {
        if let Self::Stream(source) = self {
            source.seek(position);
        }
    }

    /// Fill `out` (stereo interleaved) with the frames that start at `position`. Past the end the
    /// output is silence. Returns true when a stream had no data ready (an underrun).
    #[inline]
    pub fn read(&mut self, position: u64, out: &mut [f32]) -> bool {
        match self {
            Self::Memory(source) => {
                source.read(position, out);
                false
            }
            Self::Stream(source) => source.read(position, out),
            Self::Sampler(sampler) => {
                sampler.read(position, out);
                false
            }
        }
    }
}

#[derive(Debug)]
pub struct MemorySource {
    samples: Arc<[f32]>,
}

impl MemorySource {
    fn read(&self, position: u64, out: &mut [f32]) {
        let start = usize::try_from(position).unwrap_or(usize::MAX).saturating_mul(CHANNELS).min(self.samples.len());
        let available = self.samples.len().saturating_sub(start).min(out.len());
        out[..available].copy_from_slice(&self.samples[start..start + available]);
        out[available..].fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_reads_pad_with_silence_past_the_end() {
        let mut source = Source::memory(vec![1.0, 2.0, 3.0, 4.0]);
        let mut out = [9.0; 6];
        assert!(!source.read(1, &mut out));
        assert_eq!(out, [3.0, 4.0, 0.0, 0.0, 0.0, 0.0]);
        assert!(!source.read(10, &mut out));
        assert_eq!(out, [0.0; 6]);
    }
}
