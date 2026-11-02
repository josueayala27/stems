use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

/// A fresh directory for one test.
pub fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("stems-library-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// Write a 16-bit PCM WAV file with `channels` interleaved channels.
pub fn write_wav(path: &Path, sample_rate: u32, channels: u16, samples: &[i16]) {
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

/// A mono click track: a 5 ms 1 kHz burst on every beat.
pub fn click_samples(bpm: f64, sample_rate: u32, seconds: f64) -> Vec<i16> {
    let frames = (seconds * f64::from(sample_rate)) as usize;
    let beat = 60.0 * f64::from(sample_rate) / bpm;
    let burst = (0.005 * f64::from(sample_rate)) as usize;
    let mut samples = vec![0i16; frames];
    let mut index = 0;
    loop {
        let start = (index as f64 * beat).round() as usize;
        if start >= frames {
            return samples;
        }
        for offset in 0..burst.min(frames - start) {
            let phase = offset as f64 * 1_000.0 * std::f64::consts::TAU / f64::from(sample_rate);
            samples[start + offset] = (phase.sin() * 20_000.0) as i16;
        }
        index += 1;
    }
}
