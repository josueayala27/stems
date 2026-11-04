//! Linear timecode (LTC) out: SMPTE 12M 80-bit frames, biphase-mark coded into audio.
//!
//! - Bits go out least significant first per field: frame, seconds, minutes and hours BCD with
//!   user bits between them, then the `0x3FFD` sync word in bits 64–79 (what Lumen's decoder looks for).
//! - Biphase mark: the level flips at every bit-cell boundary, and again mid-cell for a one.
//! - The polarity bit (27, or 59 at 25 fps) makes the ones in every frame even, so each frame
//!   starts at the same level. The signal is then a pure function of the play head: jumps,
//!   vamps and offline renders need no encoder state.

use crate::timecode::{FrameRate, Timecode};

pub const FRAME_BITS: usize = 80;
pub const SYNC_WORD: u16 = 0x3FFD;

/// The 80 bits of one LTC frame in transmission order.
pub fn frame_bits(timecode: Timecode) -> [bool; FRAME_BITS] {
    let mut bits = [false; FRAME_BITS];
    let mut put = |start: usize, width: usize, value: u8| {
        for bit in 0..width {
            bits[start + bit] = (value >> bit) & 1 == 1;
        }
    };
    put(0, 4, timecode.frames % 10);
    put(8, 2, timecode.frames / 10);
    put(16, 4, timecode.seconds % 10);
    put(24, 3, timecode.seconds / 10);
    put(32, 4, timecode.minutes % 10);
    put(40, 3, timecode.minutes / 10);
    put(48, 4, timecode.hours % 10);
    put(56, 2, timecode.hours / 10);
    bits[10] = timecode.rate.drop_frame();
    for bit in 0..16 {
        bits[64 + bit] = (SYNC_WORD >> bit) & 1 == 1;
    }
    let polarity = if timecode.rate == FrameRate::Fps25 { 59 } else { 27 };
    let ones = bits.iter().filter(|&&bit| bit).count();
    bits[polarity] = ones % 2 == 1;
    bits
}

/// Renders LTC for a song: the frame under each song sample, starting at `start`.
#[derive(Debug, Clone, PartialEq)]
pub struct LtcGenerator {
    rate: FrameRate,
    start: u64,
    sample_rate: u32,
    /// Song length in samples; silence after it.
    length: u64,
}

impl LtcGenerator {
    pub fn new(rate: FrameRate, start: Timecode, sample_rate: u32, length: u64) -> Self {
        Self { rate, start: start.to_frames(), sample_rate: sample_rate.max(1), length }
    }

    pub fn rate(&self) -> FrameRate {
        self.rate
    }

    pub fn length(&self) -> u64 {
        self.length
    }

    /// The timecode under song sample `position`.
    pub fn timecode_at(&self, position: u64) -> Timecode {
        Timecode::from_frames(self.start + self.frame_index(position), self.rate)
    }

    fn frame_index(&self, position: u64) -> u64 {
        // Exact for integer rates; 29.97 and 23.976 use the 1001 ratio.
        let (numerator, denominator) = match self.rate {
            FrameRate::Fps23_976 => (24_000u128, 1_001u128),
            FrameRate::Fps29_97 | FrameRate::Fps29_97Drop => (30_000, 1_001),
            rate => (u128::from(rate.nominal_fps()), 1),
        };
        (u128::from(position) * numerator / (u128::from(self.sample_rate) * denominator)) as u64
    }

    /// Fill `out` with mono LTC at ±1 for the samples from `position`, silence past the end.
    /// No allocation: safe on the real-time thread.
    pub fn fill(&self, position: u64, out: &mut [f32]) {
        self.fill_with(position, out.len(), |index, value| out[index] = value);
    }

    /// Call `put(index, level)` for `count` samples from `position`. No allocation.
    #[inline]
    pub fn fill_with(&self, position: u64, count: usize, mut put: impl FnMut(usize, f32)) {
        let samples_per_frame = f64::from(self.sample_rate) / self.rate.actual_fps();
        let mut cached: Option<(u64, [u8; FRAME_BITS + 1], [bool; FRAME_BITS])> = None;
        for offset in 0..count {
            let at = position + offset as u64;
            if at >= self.length {
                put(offset, 0.0);
                continue;
            }
            let index = self.frame_index(at);
            let (_, ones_before, bits) = match cached {
                Some(entry) if entry.0 == index => entry,
                _ => {
                    let bits = frame_bits(Timecode::from_frames(self.start + index, self.rate));
                    let mut prefix = [0u8; FRAME_BITS + 1];
                    for (cell, &bit) in bits.iter().enumerate() {
                        prefix[cell + 1] = prefix[cell] + u8::from(bit);
                    }
                    let entry = (index, prefix, bits);
                    cached = Some(entry);
                    entry
                }
            };
            let into_frame = (at as f64 - index as f64 * samples_per_frame).max(0.0) / samples_per_frame;
            let cells = (into_frame * FRAME_BITS as f64).min(FRAME_BITS as f64 - 1e-9);
            let cell = cells as usize;
            let second_half = cells - cell as f64 >= 0.5;
            // Flips so far in this frame: one per cell started, one per earlier one-bit, and this
            // cell's mid flip once past half. Every frame starts low before its first flip.
            let flips = cell + 1 + usize::from(ones_before[cell]) + usize::from(second_half && bits[cell]);
            put(offset, if flips % 2 == 1 { 1.0 } else { -1.0 });
        }
    }
}

/// A SMPTE 12M LTC decoder, for tests and loopback checks. The transition logic is Lumen's
/// (`lumen-control/src/ltc.rs`: Schmitt trigger, half and full cells, an 80-bit window that
/// finds the sync word) with two fixes: the cell period is a frame over 80, and fields are
/// read at their SMPTE bit positions instead of as packed bytes.
pub struct LtcDecoder {
    sample_rate: f64,
    rate: FrameRate,
    index: u64,
    polarity: Option<bool>,
    last_transition: Option<u64>,
    pending_half: bool,
    window: std::collections::VecDeque<bool>,
}

impl LtcDecoder {
    pub fn new(sample_rate: f64, rate: FrameRate) -> Self {
        Self { sample_rate, rate, index: 0, polarity: None, last_transition: None, pending_half: false, window: std::collections::VecDeque::with_capacity(FRAME_BITS) }
    }

    /// Feed one mono sample; returns a timecode when a frame completes.
    pub fn push_sample(&mut self, sample: f32) -> Option<Timecode> {
        let threshold = 0.02;
        let polarity = if sample >= threshold {
            Some(true)
        } else if sample <= -threshold {
            Some(false)
        } else {
            self.polarity
        };
        let output = match (self.polarity, polarity) {
            (Some(previous), Some(current)) if previous != current => self.transition(self.index),
            _ => None,
        };
        self.polarity = polarity;
        self.index += 1;
        output
    }

    fn transition(&mut self, at: u64) -> Option<Timecode> {
        let last = self.last_transition.replace(at)?;
        let delta = (at - last) as f64;
        let period = self.sample_rate / self.rate.actual_fps() / FRAME_BITS as f64;
        let bit = if delta < period * 0.75 {
            if self.pending_half {
                self.pending_half = false;
                true
            } else {
                self.pending_half = true;
                return None;
            }
        } else if delta <= period * 1.5 {
            self.pending_half = false;
            false
        } else {
            self.pending_half = false;
            return None;
        };
        self.push_bit(bit)
    }

    fn push_bit(&mut self, bit: bool) -> Option<Timecode> {
        self.window.push_back(bit);
        if self.window.len() > FRAME_BITS {
            self.window.pop_front();
        }
        if self.window.len() < FRAME_BITS {
            return None;
        }
        let field = |start: usize, width: usize| (0..width).fold(0u8, |value, i| value | (u8::from(self.window[start + i]) << i));
        if u16::from(field(64, 8)) | (u16::from(field(72, 8)) << 8) != SYNC_WORD {
            return None;
        }
        let rate = if self.window[10] { FrameRate::Fps29_97Drop } else { self.rate };
        let timecode = Timecode::new(
            field(48, 4) + 10 * field(56, 2),
            field(32, 4) + 10 * field(40, 3),
            field(16, 4) + 10 * field(24, 3),
            field(0, 4) + 10 * field(8, 2),
            rate,
        )
        .ok();
        self.window.clear();
        timecode
    }
}

/// Every timecode `samples` carries.
pub fn decode(samples: &[f32], sample_rate: u32, rate: FrameRate) -> Vec<Timecode> {
    let mut decoder = LtcDecoder::new(f64::from(sample_rate), rate);
    samples.iter().filter_map(|&sample| decoder.push_sample(sample)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;


    fn render(rate: FrameRate, start: &str, sample_rate: u32, seconds: f64) -> Vec<f32> {
        let start = Timecode::parse(start, rate).unwrap();
        let length = (seconds * f64::from(sample_rate)) as u64;
        let generator = LtcGenerator::new(rate, start, sample_rate, length);
        let mut out = vec![0.0; length as usize];
        // Odd block sizes: the output must not depend on how the callback splits it.
        let mut done = 0;
        for block in [37usize, 128, 1_000, 7].iter().cycle() {
            if done >= out.len() {
                break;
            }
            let end = (done + block).min(out.len());
            generator.fill(done as u64, &mut out[done..end]);
            done = end;
        }
        out
    }

    #[test]
    fn frames_carry_bcd_fields_the_sync_word_and_even_parity() {
        let bits = frame_bits(Timecode::parse("12:34:56:17", FrameRate::Fps30).unwrap());
        let field = |start: usize, width: usize| (0..width).fold(0u8, |value, bit| value | (u8::from(bits[start + bit]) << bit));
        assert_eq!((field(0, 4), field(8, 2)), (7, 1));
        assert_eq!((field(16, 4), field(24, 3)), (6, 5));
        assert_eq!((field(32, 4), field(40, 3)), (4, 3));
        assert_eq!((field(48, 4), field(56, 2)), (2, 1));
        assert_eq!(u16::from(field(64, 8)) | (u16::from(field(72, 8)) << 8), SYNC_WORD);
        for rate in [FrameRate::Fps24, FrameRate::Fps25, FrameRate::Fps29_97Drop, FrameRate::Fps30] {
            for frames in [0, 1, 999, 86_000] {
                let bits = frame_bits(Timecode::from_frames(frames, rate));
                assert_eq!(bits.iter().filter(|&&bit| bit).count() % 2, 0, "{rate:?} {frames}");
            }
        }
        assert!(frame_bits(Timecode::parse("00:00:00;00", FrameRate::Fps29_97Drop).unwrap())[10]);
    }

    #[test]
    fn a_smpte_decoder_reads_every_frame_at_every_rate() {
        for (rate, start) in [
            (FrameRate::Fps24, "00:59:59:20"),
            (FrameRate::Fps25, "01:00:00:00"),
            (FrameRate::Fps29_97Drop, "00:00:59;25"),
            (FrameRate::Fps30, "23:59:59:28"),
            (FrameRate::Fps23_976, "10:00:00:00"),
        ] {
            for sample_rate in [44_100, 48_000, 96_000] {
                let decoded = decode(&render(rate, start, sample_rate, 2.0), sample_rate, rate);
                // The decoder locks during the first frame (its first flip is at sample 0, which no
                // decoder sees) and reports a frame once the next one's first flip arrives, so the
                // first and the last frame are not reported. Every frame between them is.
                let first = Timecode::parse(start, rate).unwrap().to_frames() + 1;
                let expected = (2.0 * rate.actual_fps()).floor() as usize - 2;
                assert!(decoded.len() >= expected, "{rate:?} at {sample_rate}: {} of {expected}", decoded.len());
                for (offset, timecode) in decoded.iter().enumerate() {
                    assert_eq!(timecode.to_frames(), (first + offset as u64) % crate::timecode::frames_per_day(rate), "{rate:?} at {sample_rate}");
                }
            }
        }
    }

    #[test]
    fn the_signal_is_a_function_of_the_play_head() {
        let generator = LtcGenerator::new(FrameRate::Fps25, Timecode::parse("01:00:00:00", FrameRate::Fps25).unwrap(), 48_000, 480_000);
        let mut whole = vec![0.0; 10_000];
        generator.fill(100_000, &mut whole);
        let mut part = vec![0.0; 3_333];
        generator.fill(103_000, &mut part);
        assert_eq!(&whole[3_000..6_333], &part[..]);
        assert_eq!(generator.timecode_at(48_000).to_string(), "01:00:01:00");
        let mut tail = vec![9.0; 10];
        generator.fill(479_995, &mut tail);
        assert!(tail[5..].iter().all(|&sample| sample == 0.0));
    }
}
