//! File decoding for the disk threads: `symphonia` decodes, `rubato` resamples to the device rate.
//! Output is always stereo interleaved f32. Mono is copied to both sides; channels past the
//! second are ignored until routing (M4).

use std::fs::File;
use std::path::Path;

use rubato::{FftFixedIn, Resampler};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as DecodeError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::TimeBase;

use crate::stream::FrameReader;
use crate::{EngineError, CHANNELS};

const RESAMPLE_CHUNK: usize = 1024;

/// Format facts about a file, at its own rate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileInfo {
    pub sample_rate: u32,
    pub channels: usize,
    pub frames: u64,
}

impl FileInfo {
    /// Length in frames once resampled to `sample_rate`.
    pub fn frames_at(&self, sample_rate: u32) -> u64 {
        if self.sample_rate == sample_rate || self.sample_rate == 0 {
            return self.frames;
        }
        (u128::from(self.frames) * u128::from(sample_rate) / u128::from(self.sample_rate)) as u64
    }
}

struct Opened {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    time_base: Option<TimeBase>,
    info: FileInfo,
}

fn open_file(path: &Path) -> crate::Result<Opened> {
    let file = File::open(path)?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|extension| extension.to_str()) {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe().format(
        &hint,
        stream,
        &FormatOptions { enable_gapless: true, ..Default::default() },
        &MetadataOptions::default(),
    )?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| EngineError::Decode(format!("{}: no audio track", path.display())))?;
    let params = track.codec_params.clone();
    let track_id = track.id;
    let sample_rate = params
        .sample_rate
        .ok_or_else(|| EngineError::Decode(format!("{}: unknown sample rate", path.display())))?;
    let channels = params.channels.map_or(0, |channels| channels.count());
    let decoder = symphonia::default::get_codecs().make(&params, &DecoderOptions::default())?;
    let time_base = params.time_base;
    let frames = match params.n_frames {
        Some(frames) => frames,
        None => {
            // Some formats (MP3 without a header frame) do not state their length: count packets.
            let mut total = 0;
            loop {
                match format.next_packet() {
                    Ok(packet) if packet.track_id() == track_id => total += packet.dur,
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
            let frames = to_frames(total, time_base, sample_rate);
            format.seek(SeekMode::Coarse, SeekTo::TimeStamp { ts: 0, track_id })?;
            frames
        }
    };
    Ok(Opened { format, decoder, track_id, time_base, info: FileInfo { sample_rate, channels, frames } })
}

/// Probe a file without decoding it.
pub fn probe(path: &Path) -> crate::Result<FileInfo> {
    open_file(path).map(|opened| opened.info)
}

fn to_frames(ts: u64, time_base: Option<TimeBase>, sample_rate: u32) -> u64 {
    match time_base {
        Some(base) if base.denom != 0 => {
            (u128::from(ts) * u128::from(base.numer) * u128::from(sample_rate) / u128::from(base.denom)) as u64
        }
        _ => ts,
    }
}

fn to_timestamp(frames: u64, time_base: Option<TimeBase>, sample_rate: u32) -> u64 {
    match time_base {
        Some(base) if base.numer != 0 && sample_rate != 0 => {
            (u128::from(frames) * u128::from(base.denom) / (u128::from(base.numer) * u128::from(sample_rate))) as u64
        }
        _ => frames,
    }
}

struct Resample {
    resampler: FftFixedIn<f32>,
    input: [Vec<f32>; CHANNELS],
    output: [Vec<f32>; CHANNELS],
    /// Output frames still to drop: the resampler's delay after a reset, so tracks stay aligned.
    discard: usize,
    flushed: bool,
}

impl Resample {
    fn new(from: u32, to: u32) -> crate::Result<Self> {
        let resampler = FftFixedIn::<f32>::new(from as usize, to as usize, RESAMPLE_CHUNK, 2, CHANNELS)
            .map_err(|error| EngineError::Decode(error.to_string()))?;
        let output_max = resampler.output_frames_max();
        let discard = resampler.output_delay();
        Ok(Self {
            resampler,
            input: [Vec::with_capacity(RESAMPLE_CHUNK * 2), Vec::with_capacity(RESAMPLE_CHUNK * 2)],
            output: [vec![0.0; output_max], vec![0.0; output_max]],
            discard,
            flushed: false,
        })
    }

    fn reset(&mut self) {
        self.resampler.reset();
        self.input.iter_mut().for_each(Vec::clear);
        self.discard = self.resampler.output_delay();
        self.flushed = false;
    }

    fn push_output(&mut self, produced: usize, out: &mut Vec<f32>) {
        let skip = self.discard.min(produced);
        self.discard -= skip;
        for frame in skip..produced {
            out.push(self.output[0][frame]);
            out.push(self.output[1][frame]);
        }
    }

    /// Resample every full chunk in `input`.
    fn run(&mut self, out: &mut Vec<f32>) -> crate::Result<()> {
        while self.input[0].len() >= self.resampler.input_frames_next() {
            let (used, produced) = self
                .resampler
                .process_into_buffer(&self.input, &mut self.output, None)
                .map_err(|error| EngineError::Decode(error.to_string()))?;
            self.input.iter_mut().for_each(|channel| {
                channel.drain(..used);
            });
            self.push_output(produced, out);
        }
        Ok(())
    }

    /// At the end of the file: resample what is left and the resampler's tail.
    fn flush(&mut self, out: &mut Vec<f32>) -> crate::Result<()> {
        if self.flushed {
            return Ok(());
        }
        self.flushed = true;
        let map = |error: rubato::ResampleError| EngineError::Decode(error.to_string());
        if !self.input[0].is_empty() {
            let (_, produced) =
                self.resampler.process_partial_into_buffer(Some(&self.input), &mut self.output, None).map_err(map)?;
            self.input.iter_mut().for_each(Vec::clear);
            self.push_output(produced, out);
        }
        let (_, produced) =
            self.resampler.process_partial_into_buffer(None::<&[Vec<f32>]>, &mut self.output, None).map_err(map)?;
        self.push_output(produced, out);
        Ok(())
    }
}

/// Decodes one file into stereo frames at the device rate.
pub struct FileReader {
    opened: Opened,
    device_rate: u32,
    samples: Option<SampleBuffer<f32>>,
    resample: Option<Resample>,
    /// Decoded stereo frames at the device rate not yet read.
    pending: Vec<f32>,
    pending_start: usize,
    /// After a seek: file frame the output must start at.
    skip_to: Option<u64>,
    /// Device frame the next `read` returns. Reads stop at `frames()`, which trims the zero
    /// padding the resampler adds when it flushes.
    position: u64,
    ended: bool,
}

impl FileReader {
    pub fn open(path: &Path, device_rate: u32) -> crate::Result<Self> {
        let opened = open_file(path)?;
        let resample = if opened.info.sample_rate == device_rate {
            None
        } else {
            Some(Resample::new(opened.info.sample_rate, device_rate)?)
        };
        Ok(Self {
            opened,
            device_rate,
            samples: None,
            resample,
            pending: Vec::with_capacity(RESAMPLE_CHUNK * 4 * CHANNELS),
            pending_start: 0,
            skip_to: None,
            position: 0,
            ended: false,
        })
    }

    pub fn info(&self) -> FileInfo {
        self.opened.info
    }

    pub fn file_sample_rate(&self) -> u32 {
        self.opened.info.sample_rate
    }

    pub fn channels(&self) -> usize {
        self.opened.info.channels
    }

    /// Length in frames at the device rate.
    pub fn frames(&self) -> u64 {
        self.opened.info.frames_at(self.device_rate)
    }

    /// Decode one packet into `pending`. Returns false at the end of the file.
    fn decode_packet(&mut self) -> crate::Result<bool> {
        let packet = loop {
            match self.opened.format.next_packet() {
                Ok(packet) if packet.track_id() == self.opened.track_id => break packet,
                Ok(_) => continue,
                Err(DecodeError::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                    return self.finish();
                }
                Err(DecodeError::ResetRequired) => {
                    self.opened.decoder.reset();
                    continue;
                }
                Err(error) => return Err(error.into()),
            }
        };
        let decoded = match self.opened.decoder.decode(&packet) {
            Ok(decoded) => decoded,
            // A corrupt packet is skipped, as players do.
            Err(DecodeError::DecodeError(_)) => return Ok(true),
            Err(error) => return Err(error.into()),
        };
        let spec = *decoded.spec();
        let needed = decoded.capacity() * spec.channels.count();
        if self.samples.as_ref().is_none_or(|buffer| buffer.capacity() < needed) {
            self.samples = Some(SampleBuffer::new(decoded.capacity() as u64, spec));
        }
        let Some(samples) = self.samples.as_mut() else { return Ok(true) };
        samples.copy_interleaved_ref(decoded);
        let channels = spec.channels.count().max(1);
        let interleaved = samples.samples();
        let frames = interleaved.len() / channels;

        let info = self.opened.info;
        let first = to_frames(packet.ts(), self.opened.time_base, info.sample_rate);
        let skip = match self.skip_to {
            Some(target) if first + frames as u64 <= target => return Ok(true),
            Some(target) => {
                self.skip_to = None;
                target.saturating_sub(first) as usize
            }
            None => 0,
        };

        let stereo = (skip..frames).map(|frame| {
            let base = frame * channels;
            let left = interleaved[base];
            let right = if channels > 1 { interleaved[base + 1] } else { left };
            (left, right)
        });
        match &mut self.resample {
            None => {
                for (left, right) in stereo {
                    self.pending.push(left);
                    self.pending.push(right);
                }
            }
            Some(resample) => {
                for (left, right) in stereo {
                    resample.input[0].push(left);
                    resample.input[1].push(right);
                }
                resample.run(&mut self.pending)?;
            }
        }
        Ok(true)
    }

    fn finish(&mut self) -> crate::Result<bool> {
        if let Some(resample) = &mut self.resample {
            resample.flush(&mut self.pending)?;
        }
        self.ended = true;
        Ok(false)
    }
}

impl FrameReader for FileReader {
    fn seek(&mut self, frame: u64) -> crate::Result<()> {
        let info = self.opened.info;
        let file_frame = if info.sample_rate == self.device_rate {
            frame
        } else {
            (u128::from(frame) * u128::from(info.sample_rate) / u128::from(self.device_rate)) as u64
        };
        let ts = to_timestamp(file_frame, self.opened.time_base, info.sample_rate);
        self.opened
            .format
            .seek(SeekMode::Accurate, SeekTo::TimeStamp { ts, track_id: self.opened.track_id })?;
        self.opened.decoder.reset();
        if let Some(resample) = &mut self.resample {
            resample.reset();
        }
        self.pending.clear();
        self.pending_start = 0;
        self.skip_to = Some(file_frame);
        self.position = frame;
        self.ended = false;
        Ok(())
    }

    fn read(&mut self, out: &mut [f32]) -> usize {
        let left = self.frames().saturating_sub(self.position);
        let wanted = (out.len() / CHANNELS).min(usize::try_from(left).unwrap_or(usize::MAX)) * CHANNELS;
        let mut written = 0;
        while written < wanted {
            if self.pending_start == self.pending.len() {
                self.pending.clear();
                self.pending_start = 0;
                if self.ended {
                    break;
                }
                match self.decode_packet() {
                    Ok(_) => continue,
                    Err(_) => {
                        // A broken file ends where it breaks.
                        self.ended = true;
                        break;
                    }
                }
            }
            let count = (wanted - written).min(self.pending.len() - self.pending_start);
            out[written..written + count]
                .copy_from_slice(&self.pending[self.pending_start..self.pending_start + count]);
            written += count;
            self.pending_start += count;
        }
        self.position += (written / CHANNELS) as u64;
        written / CHANNELS
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    /// Write a 16-bit PCM WAV file with `channels` interleaved channels.
    pub(crate) fn write_wav(path: &Path, sample_rate: u32, channels: u16, samples: &[i16]) {
        let data_len = (samples.len() * 2) as u32;
        let mut bytes = Vec::with_capacity(44 + samples.len() * 2);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&(sample_rate * u32::from(channels) * 2).to_le_bytes());
        bytes.extend_from_slice(&(channels * 2).to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        File::create(path).unwrap().write_all(&bytes).unwrap();
    }

    pub(crate) fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("stems-engine-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Sample value for frame i: distinct per frame, inside i16.
    fn value(frame: usize) -> i16 {
        ((frame * 7) % 30_000) as i16 - 15_000
    }

    fn as_f32(sample: i16) -> f32 {
        f32::from(sample) / 32_768.0
    }

    fn read_all(reader: &mut FileReader) -> Vec<f32> {
        let mut all = Vec::new();
        let mut chunk = vec![0.0; 777 * CHANNELS];
        loop {
            let frames = reader.read(&mut chunk);
            if frames == 0 {
                return all;
            }
            all.extend_from_slice(&chunk[..frames * CHANNELS]);
        }
    }

    #[test]
    fn decodes_mono_wav_to_stereo_at_the_same_rate() {
        let dir = temp_dir("mono");
        let path = dir.join("click.wav");
        let samples: Vec<i16> = (0..5_000).map(value).collect();
        write_wav(&path, 48_000, 1, &samples);

        assert_eq!(probe(&path).unwrap(), FileInfo { sample_rate: 48_000, channels: 1, frames: 5_000 });
        let mut reader = FileReader::open(&path, 48_000).unwrap();
        let all = read_all(&mut reader);
        let expected: Vec<f32> = samples.iter().flat_map(|&s| [as_f32(s), as_f32(s)]).collect();
        assert_eq!(all, expected);
    }

    #[test]
    fn seeks_to_the_exact_frame() {
        let dir = temp_dir("seek");
        let path = dir.join("bass.wav");
        let samples: Vec<i16> = (0..20_000).flat_map(|i| [value(i), -value(i)]).collect();
        write_wav(&path, 44_100, 2, &samples);

        let mut reader = FileReader::open(&path, 44_100).unwrap();
        reader.seek(12_345).unwrap();
        let mut out = [0.0; 4];
        assert_eq!(reader.read(&mut out), 2);
        assert_eq!(out, [as_f32(value(12_345)), as_f32(-value(12_345)), as_f32(value(12_346)), as_f32(-value(12_346))]);
    }

    #[test]
    fn resamples_to_the_device_rate_with_the_expected_length() {
        let dir = temp_dir("resample");
        let path = dir.join("keys.wav");
        let frames = 44_100;
        let samples: Vec<i16> = (0..frames)
            .map(|i| ((i as f32 * 440.0 * std::f32::consts::TAU / 44_100.0).sin() * 10_000.0) as i16)
            .collect();
        write_wav(&path, 44_100, 1, &samples);

        let mut reader = FileReader::open(&path, 48_000).unwrap();
        assert_eq!(reader.frames(), 48_000);
        let all = read_all(&mut reader);
        let decoded = all.len() / CHANNELS;
        assert!(decoded.abs_diff(48_000) < 64, "{decoded} frames");
        // Delay compensation: the sine starts at zero and rises, like the source.
        let peak = all.iter().fold(0.0f32, |peak, &s| peak.max(s.abs()));
        assert!((peak - 10_000.0 / 32_768.0).abs() < 0.02, "peak {peak}");
        let quarter = 48_000 / 440 / 4;
        assert!(all[CHANNELS] >= 0.0 && all[quarter * CHANNELS] > 0.25, "{:?}", &all[..8]);
    }
}
