//! SMPTE timecode: frame rates, labels and frame counts. Rates, serde names and the drop-frame
//! maths match Lumen's `lumen-control` (`timecode.rs`), so both apps read the same settings.

use std::fmt;

use serde::{Deserialize, Serialize};

/// SMPTE frame rates for LTC and MTC. Drop-frame is 29.97 with two frame labels skipped every
/// minute except every tenth.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum FrameRate {
    #[serde(rename = "23.976")]
    Fps23_976,
    #[serde(rename = "24")]
    Fps24,
    #[serde(rename = "25")]
    Fps25,
    #[serde(rename = "29.97")]
    Fps29_97,
    #[serde(rename = "29.97df")]
    Fps29_97Drop,
    #[default]
    #[serde(rename = "30")]
    Fps30,
}

impl FrameRate {
    /// Frame labels per timecode second.
    pub const fn nominal_fps(self) -> u32 {
        match self {
            Self::Fps23_976 | Self::Fps24 => 24,
            Self::Fps25 => 25,
            Self::Fps29_97 | Self::Fps29_97Drop | Self::Fps30 => 30,
        }
    }

    /// Real frames per second of wall time.
    pub const fn actual_fps(self) -> f64 {
        match self {
            Self::Fps23_976 => 24_000.0 / 1_001.0,
            Self::Fps24 => 24.0,
            Self::Fps25 => 25.0,
            Self::Fps29_97 | Self::Fps29_97Drop => 30_000.0 / 1_001.0,
            Self::Fps30 => 30.0,
        }
    }

    pub const fn drop_frame(self) -> bool {
        matches!(self, Self::Fps29_97Drop)
    }

    /// MTC rate bits: 00 = 24, 01 = 25, 10 = 30 drop, 11 = 30 non-drop.
    pub const fn mtc_bits(self) -> u8 {
        match self {
            Self::Fps23_976 | Self::Fps24 => 0b00,
            Self::Fps25 => 0b01,
            Self::Fps29_97 | Self::Fps29_97Drop => 0b10,
            Self::Fps30 => 0b11,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimecodeError {
    Format,
    OutOfRange(&'static str),
    DroppedLabel,
}

impl fmt::Display for TimecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Format => write!(f, "timecode must be HH:MM:SS:FF or HH:MM:SS;FF"),
            Self::OutOfRange(field) => write!(f, "timecode {field} out of range"),
            Self::DroppedLabel => write!(f, "timecode uses a dropped frame label"),
        }
    }
}

impl std::error::Error for TimecodeError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timecode {
    pub hours: u8,
    pub minutes: u8,
    pub seconds: u8,
    pub frames: u8,
    pub rate: FrameRate,
}

/// Frames in 24 hours at `rate`, where timecode wraps.
pub fn frames_per_day(rate: FrameRate) -> u64 {
    let nominal = u64::from(rate.nominal_fps());
    if rate.drop_frame() {
        // 144 ten-minute blocks of 17 982 frames.
        144 * 17_982
    } else {
        24 * 3_600 * nominal
    }
}

impl Timecode {
    pub fn new(hours: u8, minutes: u8, seconds: u8, frames: u8, rate: FrameRate) -> Result<Self, TimecodeError> {
        let timecode = Self { hours, minutes, seconds, frames, rate };
        timecode.validate()?;
        Ok(timecode)
    }

    pub fn validate(&self) -> Result<(), TimecodeError> {
        if self.hours > 23 {
            return Err(TimecodeError::OutOfRange("hours"));
        }
        if self.minutes > 59 {
            return Err(TimecodeError::OutOfRange("minutes"));
        }
        if self.seconds > 59 {
            return Err(TimecodeError::OutOfRange("seconds"));
        }
        if u32::from(self.frames) >= self.rate.nominal_fps() {
            return Err(TimecodeError::OutOfRange("frames"));
        }
        if self.rate.drop_frame() && self.seconds == 0 && self.frames < 2 && !self.minutes.is_multiple_of(10) {
            return Err(TimecodeError::DroppedLabel);
        }
        Ok(())
    }

    /// `HH:MM:SS:FF`, or `HH:MM:SS;FF` for drop-frame.
    pub fn parse(input: &str, rate: FrameRate) -> Result<Self, TimecodeError> {
        let parts: Vec<&str> = input.trim().split([':', ';']).collect();
        let [hours, minutes, seconds, frames] = parts[..] else { return Err(TimecodeError::Format) };
        let field = |text: &str| text.parse::<u8>().map_err(|_| TimecodeError::Format);
        Self::new(field(hours)?, field(minutes)?, field(seconds)?, field(frames)?, rate)
    }

    /// Frames since 00:00:00:00. Drop-frame counts real frames.
    pub fn to_frames(self) -> u64 {
        let nominal = u64::from(self.rate.nominal_fps());
        let base = (u64::from(self.hours) * 3_600 + u64::from(self.minutes) * 60 + u64::from(self.seconds)) * nominal
            + u64::from(self.frames);
        if self.rate.drop_frame() {
            let minutes = u64::from(self.hours) * 60 + u64::from(self.minutes);
            base - 2 * (minutes - minutes / 10)
        } else {
            base
        }
    }

    /// The label of frame `frames` since 00:00:00:00, wrapping at 24 hours.
    pub fn from_frames(frames: u64, rate: FrameRate) -> Self {
        let frames = frames % frames_per_day(rate);
        let nominal = u64::from(rate.nominal_fps());
        let frames = if rate.drop_frame() {
            let (tens, remainder) = (frames / 17_982, frames % 17_982);
            frames + 18 * tens + 2 * (remainder.saturating_sub(2) / 1_798)
        } else {
            frames
        };
        let (per_hour, per_minute) = (nominal * 3_600, nominal * 60);
        Self {
            hours: (frames / per_hour % 24) as u8,
            minutes: ((frames % per_hour) / per_minute) as u8,
            seconds: ((frames % per_minute) / nominal) as u8,
            frames: (frames % nominal) as u8,
            rate,
        }
    }
}

impl fmt::Display for Timecode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let separator = if self.rate.drop_frame() { ';' } else { ':' };
        write!(f, "{:02}:{:02}:{:02}{separator}{:02}", self.hours, self.minutes, self.seconds, self.frames)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rates_use_lumens_names() {
        let rate: FrameRate = serde_json::from_str("\"29.97df\"").unwrap();
        assert_eq!(rate, FrameRate::Fps29_97Drop);
        assert_eq!(serde_json::to_string(&FrameRate::Fps23_976).unwrap(), "\"23.976\"");
    }

    #[test]
    fn parses_formats_and_counts_non_drop() {
        let timecode = Timecode::parse("01:02:03:04", FrameRate::Fps25).unwrap();
        assert_eq!(timecode.to_frames(), (3_600 + 2 * 60 + 3) * 25 + 4);
        assert_eq!(Timecode::from_frames(timecode.to_frames(), FrameRate::Fps25), timecode);
        assert_eq!(timecode.to_string(), "01:02:03:04");
        assert_eq!(Timecode::parse("1:2:3", FrameRate::Fps25), Err(TimecodeError::Format));
        assert_eq!(Timecode::parse("00:00:00:25", FrameRate::Fps25), Err(TimecodeError::OutOfRange("frames")));
    }

    #[test]
    fn drop_frame_skips_two_labels_a_minute_except_every_tenth() {
        let rate = FrameRate::Fps29_97Drop;
        assert_eq!(Timecode::from_frames(1_799, rate).to_string(), "00:00:59;29");
        assert_eq!(Timecode::from_frames(1_800, rate).to_string(), "00:01:00;02");
        assert_eq!(Timecode::from_frames(17_982, rate).to_string(), "00:10:00;00");
        assert_eq!(Timecode::parse("00:01:00;00", rate), Err(TimecodeError::DroppedLabel));
        for frames in [0, 1_800, 17_981, 107_892, 1_000_000] {
            assert_eq!(Timecode::from_frames(frames, rate).to_frames(), frames);
        }
    }

    #[test]
    fn wraps_at_24_hours() {
        for rate in [FrameRate::Fps24, FrameRate::Fps25, FrameRate::Fps30, FrameRate::Fps29_97Drop] {
            let day = frames_per_day(rate);
            assert_eq!(Timecode::from_frames(day - 1, rate).hours, 23);
            assert_eq!(Timecode::from_frames(day + 5, rate), Timecode::from_frames(5, rate));
        }
    }
}
