//! Output devices through `cpal` (CoreAudio on macOS).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Instant;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, ErrorKind, StreamConfig, StreamInstant, SupportedBufferSize};
use serde::{Deserialize, Serialize};

use crate::mixer::Mixer;
use crate::EngineError;

const STANDARD_RATES: [u32; 6] = [44_100, 48_000, 88_200, 96_000, 176_400, 192_000];
pub const MIN_BUFFER: u32 = 64;
pub const MAX_BUFFER: u32 = 1024;
pub const DEFAULT_BUFFER: u32 = 128;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    /// Most output channels of any supported configuration.
    pub channels: u16,
    pub sample_rates: Vec<u32>,
    pub default_sample_rate: Option<u32>,
    pub min_buffer: Option<u32>,
    pub max_buffer: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputConfig {
    /// A `DeviceInfo::id`. `None` is the system default output.
    pub device_id: Option<String>,
    /// `None` is the device's default rate.
    pub sample_rate: Option<u32>,
    pub buffer_size: u32,
}

impl Default for OutputConfig {
    fn default() -> Self {
        Self { device_id: None, sample_rate: None, buffer_size: DEFAULT_BUFFER }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedOutput {
    pub device_id: String,
    pub name: String,
    pub sample_rate: u32,
    pub buffer_size: u32,
    pub channels: u16,
}

pub fn list_output_devices() -> crate::Result<Vec<DeviceInfo>> {
    let host = cpal::default_host();
    let default_id = host.default_output_device().and_then(|device| device.id().ok());
    let mut devices = Vec::new();
    for device in host.output_devices()? {
        let Ok(id) = device.id() else { continue };
        let Ok(configs) = device.supported_output_configs() else { continue };
        let mut channels = 0;
        let mut rates = Vec::new();
        let mut buffers: Option<(u32, u32)> = None;
        for range in configs {
            channels = channels.max(range.channels());
            for rate in STANDARD_RATES {
                if (range.min_sample_rate()..=range.max_sample_rate()).contains(&rate) && !rates.contains(&rate) {
                    rates.push(rate);
                }
            }
            if let SupportedBufferSize::Range { min, max } = *range.buffer_size() {
                buffers = Some(buffers.map_or((min, max), |(low, high)| (low.min(min), high.max(max))));
            }
        }
        if channels == 0 {
            continue;
        }
        rates.sort_unstable();
        devices.push(DeviceInfo {
            name: device.to_string(),
            is_default: default_id.as_ref() == Some(&id),
            id: id.to_string(),
            channels,
            sample_rates: rates,
            default_sample_rate: device.default_output_config().ok().map(|config| config.sample_rate()),
            min_buffer: buffers.map(|(min, _)| min),
            max_buffer: buffers.map(|(_, max)| max),
        });
    }
    Ok(devices)
}

/// A device and stream configuration chosen for an [`OutputConfig`], before a stream exists.
pub struct Resolved {
    device: cpal::Device,
    config: StreamConfig,
    pub info: OpenedOutput,
}

pub fn resolve(config: &OutputConfig) -> crate::Result<Resolved> {
    let host = cpal::default_host();
    let device = match &config.device_id {
        Some(id) => {
            let id = id.parse().map_err(|error: cpal::Error| EngineError::Device(error.to_string()))?;
            host.device_by_id(&id).ok_or_else(|| EngineError::Device(format!("device {id} not found")))?
        }
        None => host.default_output_device().ok_or_else(|| EngineError::Device("no output device".into()))?,
    };
    let default = device.default_output_config()?;
    let sample_rate = config.sample_rate.unwrap_or(default.sample_rate());
    let range = device
        .supported_output_configs()?
        .filter(|range| (range.min_sample_rate()..=range.max_sample_rate()).contains(&sample_rate))
        .max_by_key(|range| range.channels())
        .ok_or_else(|| EngineError::Device(format!("{device} does not support {sample_rate} Hz")))?;
    let mut buffer = config.buffer_size.clamp(MIN_BUFFER, MAX_BUFFER);
    if let SupportedBufferSize::Range { min, max } = *range.buffer_size() {
        buffer = buffer.clamp(min, max);
    }
    let channels = range.channels();
    let info = OpenedOutput {
        device_id: device.id().map(|id| id.to_string()).unwrap_or_default(),
        name: device.to_string(),
        sample_rate,
        buffer_size: buffer,
        channels,
    };
    let config = StreamConfig { channels, sample_rate, buffer_size: BufferSize::Fixed(buffer) };
    Ok(Resolved { device, config, info })
}

/// Owns the mixer inside the callback and returns it when the stream is dropped, so a reopened
/// device keeps the same mixer, song and clock.
struct MixerSlot {
    mixer: Option<Mixer>,
    home: mpsc::Sender<Mixer>,
}

impl Drop for MixerSlot {
    fn drop(&mut self) {
        if let Some(mixer) = self.mixer.take() {
            let _ = self.home.send(mixer);
        }
    }
}

/// An open output stream. Dropping it stops the device and sends the mixer back.
pub struct Output {
    _stream: cpal::Stream,
    pub info: OpenedOutput,
    failed: Arc<AtomicBool>,
}

impl Output {
    /// True once the device reported an error that needs a reopen (for example it was unplugged).
    pub fn failed(&self) -> bool {
        self.failed.load(Ordering::Relaxed)
    }
}

/// Start `mixer` on the resolved device. On failure the mixer still comes back through `home`.
pub fn open(resolved: Resolved, mixer: Mixer, home: mpsc::Sender<Mixer>) -> crate::Result<Output> {
    let Resolved { device, config, info } = resolved;
    let channels = usize::from(config.channels);
    let rate = f64::from(config.sample_rate);
    let failed = Arc::new(AtomicBool::new(false));
    let error_flag = Arc::clone(&failed);
    let mut slot = MixerSlot { mixer: Some(mixer), home };
    let mut last: Option<(StreamInstant, usize)> = None;

    let stream = device.build_output_stream(
        config,
        move |data: &mut [f32], callback: &cpal::OutputCallbackInfo| {
            let started = Instant::now();
            let Some(mixer) = slot.mixer.as_mut() else {
                data.fill(0.0);
                return;
            };
            let frames = data.len() / channels;
            let playback = callback.timestamp().playback;
            if let Some((previous, previous_frames)) = last {
                // A callback later than 1.5 buffers after the last one means the device ran dry.
                let gap = playback.duration_since(previous).as_secs_f64();
                if gap > 1.5 * previous_frames as f64 / rate {
                    mixer.report_xrun();
                }
            }
            last = Some((playback, frames));
            mixer.process(data, channels);
            let budget = frames as f64 / rate;
            if budget > 0.0 {
                mixer.set_cpu_load((started.elapsed().as_secs_f64() / budget) as f32);
            }
        },
        move |error: cpal::Error| {
            if error.kind() != ErrorKind::DeviceChanged {
                error_flag.store(true, Ordering::Relaxed);
            }
        },
        None,
    )?;
    stream.play()?;
    Ok(Output { _stream: stream, info, failed })
}
