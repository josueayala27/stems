//! Disk streaming. Each track keeps its first seconds in memory, so play starts at once, and a
//! ring of decoded blocks ahead of the play head. A disk thread per song fills the rings.
//!
//! Seeks use a generation number. The real-time side bumps the generation and publishes the new
//! start frame in one atomic word; the disk side sees it, seeks its decoder and tags new blocks
//! with the new generation. Blocks with an old generation are dropped unread.

use std::fmt;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::CHANNELS;

/// Frames in one streamed block.
pub const BLOCK_FRAMES: usize = 1024;
/// Seconds of each track kept in memory from the start.
pub const HEAD_SECONDS: u64 = 5;
/// Seconds kept in memory from each cue point (section starts, markers), so a quantized jump
/// plays at once while the disk thread refills from there.
pub const CUE_SECONDS: f64 = 1.5;
/// Seconds of decoded audio each ring holds ahead of the play head.
pub const LOOKAHEAD_SECONDS: u64 = 2;

const POSITION_BITS: u32 = 48;
const POSITION_MASK: u64 = (1 << POSITION_BITS) - 1;

fn pack(generation: u16, frame: u64) -> u64 {
    (u64::from(generation) << POSITION_BITS) | (frame & POSITION_MASK)
}

fn unpack(word: u64) -> (u16, u64) {
    ((word >> POSITION_BITS) as u16, word & POSITION_MASK)
}

/// Decoded audio the disk thread reads from: stereo interleaved at the device rate.
pub trait FrameReader: Send {
    /// Move so the next `read` starts at this frame.
    fn seek(&mut self, frame: u64) -> crate::Result<()>;
    /// Fill `out` from the current frame and return the frames written. 0 means the end.
    fn read(&mut self, out: &mut [f32]) -> usize;
}

/// A [`FrameReader`] over samples in memory, for tests.
pub struct MemoryReader {
    samples: Arc<[f32]>,
    frame: usize,
}

impl MemoryReader {
    pub fn new(samples: impl Into<Arc<[f32]>>) -> Self {
        Self { samples: samples.into(), frame: 0 }
    }
}

impl FrameReader for MemoryReader {
    fn seek(&mut self, frame: u64) -> crate::Result<()> {
        self.frame = usize::try_from(frame).unwrap_or(usize::MAX);
        Ok(())
    }

    fn read(&mut self, out: &mut [f32]) -> usize {
        let start = self.frame.saturating_mul(CHANNELS).min(self.samples.len());
        let count = (self.samples.len() - start).min(out.len()) / CHANNELS;
        out[..count * CHANNELS].copy_from_slice(&self.samples[start..start + count * CHANNELS]);
        self.frame += count;
        count
    }
}

struct Block {
    generation: u16,
    start: u64,
    frames: usize,
    samples: [f32; BLOCK_FRAMES * CHANNELS],
}

struct Shared {
    /// Packed (generation, first frame the disk thread must deliver).
    request: AtomicU64,
    /// Packed (generation, frame where the decoder ran out). Reads past it are silence, not underruns.
    end: AtomicU64,
}

/// Audio held in memory from `start`, stereo interleaved.
#[derive(Clone)]
pub struct Head {
    pub start: u64,
    pub samples: Arc<[f32]>,
}

impl Head {
    fn end(&self) -> u64 {
        self.start + (self.samples.len() / CHANNELS) as u64
    }
}

/// Real-time side of a streamed track.
pub struct StreamSource {
    /// Sorted by start; the first starts at 0.
    heads: Vec<Head>,
    head_frames: u64,
    frames: u64,
    generation: u16,
    ring: rtrb::Consumer<Block>,
    shared: Arc<Shared>,
}

impl fmt::Debug for StreamSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StreamSource")
            .field("head_frames", &self.head_frames)
            .field("frames", &self.frames)
            .field("generation", &self.generation)
            .finish_non_exhaustive()
    }
}

/// Disk side of a streamed track.
pub struct StreamFeeder {
    reader: Box<dyn FrameReader>,
    ring: rtrb::Producer<Block>,
    shared: Arc<Shared>,
    generation: u16,
    next: u64,
    frames: u64,
    ended: bool,
}

/// Build a streamed track. `head` holds the first frames (stereo interleaved); `reader` must be
/// positioned right after them. `frames` is the track length and `ring_blocks` the lookahead.
pub fn stream(
    head: impl Into<Arc<[f32]>>,
    frames: u64,
    reader: Box<dyn FrameReader>,
    ring_blocks: usize,
) -> (StreamSource, StreamFeeder) {
    stream_with_cues(head, Vec::new(), frames, reader, ring_blocks)
}

/// Like [`stream`], with extra in-memory heads at cue points (each must start after `head`).
pub fn stream_with_cues(
    head: impl Into<Arc<[f32]>>,
    cues: Vec<Head>,
    frames: u64,
    reader: Box<dyn FrameReader>,
    ring_blocks: usize,
) -> (StreamSource, StreamFeeder) {
    let head: Arc<[f32]> = head.into();
    let head_frames = (head.len() / CHANNELS) as u64;
    let mut heads = vec![Head { start: 0, samples: head }];
    heads.extend(cues.into_iter().filter(|cue| cue.start >= head_frames && !cue.samples.is_empty()));
    heads.sort_by_key(|head| head.start);
    let shared = Arc::new(Shared {
        request: AtomicU64::new(pack(0, head_frames)),
        end: AtomicU64::new(pack(0, POSITION_MASK)),
    });
    let (producer, consumer) = rtrb::RingBuffer::new(ring_blocks.max(2));
    let source = StreamSource {
        heads,
        head_frames,
        frames,
        generation: 0,
        ring: consumer,
        shared: Arc::clone(&shared),
    };
    let feeder = StreamFeeder {
        reader,
        ring: producer,
        shared,
        generation: 0,
        next: head_frames,
        frames,
        ended: head_frames >= frames,
    };
    (source, feeder)
}

/// Ring blocks for `LOOKAHEAD_SECONDS` at `sample_rate`.
pub fn lookahead_blocks(sample_rate: u32) -> usize {
    (u64::from(sample_rate) * LOOKAHEAD_SECONDS).div_ceil(BLOCK_FRAMES as u64) as usize
}

impl StreamSource {
    pub fn frames(&self) -> u64 {
        self.frames
    }

    fn head_at(&self, frame: u64) -> Option<&Head> {
        let index = self.heads.partition_point(|head| head.start <= frame);
        self.heads[..index].last().filter(|head| frame < head.end())
    }

    pub fn seek(&mut self, position: u64) {
        self.generation = self.generation.wrapping_add(1);
        // Inside a head, the disk thread starts where the head ends.
        let from = self.head_at(position).map_or(position, Head::end).max(self.head_frames);
        self.shared.request.store(pack(self.generation, from), Ordering::Release);
        // Free the ring now so the disk thread can refill it at once. A block pushed before the
        // disk thread saw the request still has the old generation and is dropped on read.
        if let Ok(chunk) = self.ring.read_chunk(self.ring.slots()) {
            chunk.commit_all();
        }
    }

    fn drop_front(&mut self) {
        if let Ok(chunk) = self.ring.read_chunk(1) {
            chunk.commit_all();
        }
    }

    /// Real-time read. Never blocks: missing data is silence and returns true.
    pub fn read(&mut self, position: u64, out: &mut [f32]) -> bool {
        let wanted = out.len() / CHANNELS;
        let mut done = 0;
        let mut underrun = false;
        while done < wanted {
            let frame = position + done as u64;
            let rest = wanted - done;
            if frame >= self.frames {
                out[done * CHANNELS..].fill(0.0);
                break;
            }
            if let Some(head) = self.head_at(frame) {
                let count = rest.min((head.end() - frame) as usize);
                let from = (frame - head.start) as usize * CHANNELS;
                out[done * CHANNELS..(done + count) * CHANNELS]
                    .copy_from_slice(&head.samples[from..from + count * CHANNELS]);
                done += count;
                continue;
            }
            let Ok(block) = self.ring.peek() else {
                let (generation, end) = unpack(self.shared.end.load(Ordering::Acquire));
                underrun |= !(generation == self.generation && frame >= end);
                out[done * CHANNELS..].fill(0.0);
                break;
            };
            if block.generation != self.generation || block.start + block.frames as u64 <= frame {
                self.drop_front();
                continue;
            }
            if block.start > frame {
                // A gap before the next block: the disk thread is behind this seek.
                let count = rest.min((block.start - frame) as usize);
                out[done * CHANNELS..(done + count) * CHANNELS].fill(0.0);
                underrun = true;
                done += count;
                continue;
            }
            let offset = (frame - block.start) as usize;
            let count = rest.min(block.frames - offset);
            out[done * CHANNELS..(done + count) * CHANNELS]
                .copy_from_slice(&block.samples[offset * CHANNELS..(offset + count) * CHANNELS]);
            done += count;
            if offset + count == block.frames {
                self.drop_front();
            }
        }
        underrun
    }
}

impl StreamFeeder {
    /// Decode one block if the ring has room. Returns true when it did work.
    pub fn pump(&mut self) -> bool {
        let (generation, from) = unpack(self.shared.request.load(Ordering::Acquire));
        if generation != self.generation {
            self.generation = generation;
            self.next = from;
            self.ended = from >= self.frames || self.reader.seek(from).is_err();
            if self.ended {
                self.shared.end.store(pack(generation, from), Ordering::Release);
            }
        }
        if self.ended || self.ring.slots() == 0 {
            return false;
        }
        let mut block = Block { generation, start: self.next, frames: 0, samples: [0.0; BLOCK_FRAMES * CHANNELS] };
        block.frames = self.reader.read(&mut block.samples);
        if block.frames == 0 {
            self.ended = true;
            self.shared.end.store(pack(generation, self.next), Ordering::Release);
            return false;
        }
        self.next += block.frames as u64;
        // `slots() > 0` was checked and this is the only producer, so the push succeeds.
        let _ = self.ring.push(block);
        true
    }

    /// Pump until the ring is full or the track ended. Tests use this for deterministic fills.
    pub fn fill(&mut self) {
        while self.pump() {}
    }
}

/// The disk thread of one song. Dropping it stops the thread.
pub struct Feeder {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Feeder {
    pub fn spawn(mut feeders: Vec<StreamFeeder>) -> crate::Result<Self> {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&stop);
        let thread = thread::Builder::new().name("stems-disk".into()).spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                let mut worked = false;
                for feeder in &mut feeders {
                    worked |= feeder.pump();
                }
                if !worked {
                    thread::sleep(Duration::from_millis(2));
                }
            }
        })?;
        Ok(Self { stop, thread: Some(thread) })
    }
}

impl Drop for Feeder {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Frame i is (i, -i).
    fn ramp(frames: usize) -> Vec<f32> {
        (0..frames).flat_map(|i| [i as f32, -(i as f32)]).collect()
    }

    fn streamed(frames: usize, head_frames: usize, ring_blocks: usize) -> (StreamSource, StreamFeeder) {
        let all = ramp(frames);
        let mut reader = MemoryReader::new(all.clone());
        reader.seek(head_frames as u64).unwrap();
        stream(all[..head_frames * CHANNELS].to_vec(), frames as u64, Box::new(reader), ring_blocks)
    }

    #[test]
    fn reads_across_head_and_ring_match_the_source() {
        let (mut source, mut feeder) = streamed(10_000, 1_500, 16);
        feeder.fill();
        let mut out = vec![0.0; 6_000 * CHANNELS];
        assert!(!source.read(0, &mut out));
        assert_eq!(out, ramp(6_000));
    }

    #[test]
    fn an_empty_ring_is_an_underrun_not_silence_without_notice() {
        let (mut source, _feeder) = streamed(10_000, 100, 16);
        let mut out = vec![1.0; 200 * CHANNELS];
        assert!(source.read(0, &mut out));
        assert_eq!(out[..100 * CHANNELS], ramp(100)[..]);
        assert!(out[100 * CHANNELS..].iter().all(|&s| s == 0.0));
    }

    #[test]
    fn a_seek_drops_stale_blocks_and_reads_the_new_position() {
        let (mut source, mut feeder) = streamed(20_000, 100, 4);
        feeder.fill();
        source.seek(12_345);
        feeder.fill();
        let mut out = vec![0.0; 3 * CHANNELS];
        assert!(!source.read(12_345, &mut out));
        assert_eq!(out, [12_345.0, -12_345.0, 12_346.0, -12_346.0, 12_347.0, -12_347.0]);
    }

    #[test]
    fn a_seek_back_into_the_head_reads_memory_then_the_ring() {
        let (mut source, mut feeder) = streamed(5_000, 1_000, 8);
        feeder.fill();
        source.seek(3_000);
        feeder.fill();
        source.seek(500);
        feeder.fill();
        let mut out = vec![0.0; 1_000 * CHANNELS];
        assert!(!source.read(500, &mut out));
        let expected: Vec<f32> = ramp(1_500)[500 * CHANNELS..].to_vec();
        assert_eq!(out, expected);
    }

    #[test]
    fn reading_past_the_decoded_end_is_silence_without_underrun() {
        // The reported length is longer than what decodes, as with resampled length estimates.
        let all = ramp(2_000);
        let mut reader = MemoryReader::new(all.clone());
        reader.seek(100).unwrap();
        let (mut source, mut feeder) =
            stream(all[..100 * CHANNELS].to_vec(), 2_100, Box::new(reader), 4);
        feeder.fill();
        let mut out = vec![0.0; 2_100 * CHANNELS];
        let mut underrun = false;
        for (index, chunk) in out.chunks_mut(512 * CHANNELS).enumerate() {
            underrun |= source.read(index as u64 * 512, chunk);
            feeder.fill();
        }
        assert!(!underrun);
        assert_eq!(out[..2_000 * CHANNELS], ramp(2_000)[..]);
        assert!(out[2_000 * CHANNELS..].iter().all(|&s| s == 0.0));
    }

    #[test]
    fn a_seek_to_a_cue_plays_from_memory_at_once() {
        let all = ramp(40_000);
        let mut reader = MemoryReader::new(all.clone());
        reader.seek(100).unwrap();
        let cue = Head { start: 30_000, samples: all[30_000 * CHANNELS..31_000 * CHANNELS].into() };
        let (mut source, mut feeder) =
            stream_with_cues(all[..100 * CHANNELS].to_vec(), vec![cue], 40_000, Box::new(reader), 4);
        feeder.fill();
        source.seek(30_000);
        // No fill yet: the cue covers the first 1 000 frames.
        let mut out = vec![0.0; 1_000 * CHANNELS];
        assert!(!source.read(30_000, &mut out));
        assert_eq!(out, ramp(31_000)[30_000 * CHANNELS..]);
        // The disk thread continues from the cue's end.
        feeder.fill();
        let mut next = vec![0.0; 2 * CHANNELS];
        assert!(!source.read(31_000, &mut next));
        assert_eq!(next, [31_000.0, -31_000.0, 31_001.0, -31_001.0]);
    }

    #[test]
    fn the_feeder_thread_fills_the_ring() {
        let (mut source, feeder) = streamed(50_000, 100, 8);
        let feeder = Feeder::spawn(vec![feeder]).unwrap();
        thread::sleep(Duration::from_millis(50));
        let mut out = vec![0.0; 4_000 * CHANNELS];
        assert!(!source.read(0, &mut out));
        assert_eq!(out, ramp(4_000));
        drop(feeder);
    }
}
