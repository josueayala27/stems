//! Peak and RMS meters. The real-time thread feeds samples and settles the readings each time it
//! publishes state; the UI reads them from the state at about 60 Hz.
//!
//! Ballistics:
//! - peak: the highest sample since the last publish, or the held peak decaying exponentially
//!   with a 300 ms time constant, whichever is higher;
//! - RMS: the mean square since the last publish, averaged exponentially with a 300 ms time
//!   constant, then the square root. A steady sine of amplitude `a` reads `a / sqrt(2)`.

/// Time constant of the peak release and the RMS average.
pub const METER_SECONDS: f32 = 0.3;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Meter {
    peak_window: f32,
    sum_squares: f64,
    frames: u64,
    peak: f32,
    mean_square: f32,
}

impl Meter {
    /// One stereo frame. Both sides count for the peak; the RMS is the mean of both sides.
    #[inline]
    pub fn feed(&mut self, left: f32, right: f32) {
        self.peak_window = self.peak_window.max(left.abs()).max(right.abs());
        self.sum_squares += 0.5 * (f64::from(left) * f64::from(left) + f64::from(right) * f64::from(right));
        self.frames += 1;
    }

    /// Settle the readings for `elapsed` frames at `sample_rate`. Returns `(peak, rms)`.
    pub fn settle(&mut self, elapsed: usize, sample_rate: u32) -> (f32, f32) {
        let decay = (-(elapsed as f32) / (METER_SECONDS * sample_rate.max(1) as f32)).exp();
        self.peak = self.peak_window.max(self.peak * decay);
        let window = if self.frames > 0 { (self.sum_squares / self.frames as f64) as f32 } else { 0.0 };
        self.mean_square = self.mean_square * decay + window * (1.0 - decay);
        self.peak_window = 0.0;
        self.sum_squares = 0.0;
        self.frames = 0;
        (self.peak, self.mean_square.max(0.0).sqrt())
    }

    pub fn peak(&self) -> f32 {
        self.peak
    }

    pub fn rms(&self) -> f32 {
        self.mean_square.max(0.0).sqrt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;
    const BLOCK: usize = 128;

    fn run(meter: &mut Meter, blocks: usize, sample: impl Fn(usize) -> f32) -> (f32, f32) {
        let mut reading = (0.0, 0.0);
        for block in 0..blocks {
            for frame in 0..BLOCK {
                let value = sample(block * BLOCK + frame);
                meter.feed(value, value);
            }
            reading = meter.settle(BLOCK, RATE);
        }
        reading
    }

    #[test]
    fn a_steady_sine_reads_its_peak_and_amplitude_over_root_two() {
        let mut meter = Meter::default();
        let sine = |frame: usize| 0.8 * (frame as f32 * 2.0 * std::f32::consts::PI * 1_000.0 / RATE as f32).sin();
        // Two seconds: well past the 300 ms time constant.
        let (peak, rms) = run(&mut meter, 2 * RATE as usize / BLOCK, sine);
        assert!((peak - 0.8).abs() < 0.01, "peak {peak}");
        assert!((rms - 0.8 / 2f32.sqrt()).abs() < 0.01, "rms {rms}");
    }

    #[test]
    fn the_peak_holds_the_highest_sample_then_releases_by_the_time_constant() {
        let mut meter = Meter::default();
        meter.feed(1.0, -0.2);
        assert_eq!(meter.settle(BLOCK, RATE).0, 1.0);
        // 300 ms of silence: one time constant, so 1/e of the peak.
        let (peak, _) = run(&mut meter, (0.3 * RATE as f32) as usize / BLOCK, |_| 0.0);
        assert!((peak - (-1.0f32).exp()).abs() < 0.01, "peak {peak}");
    }

    #[test]
    fn rms_rises_and_falls_smoothly() {
        let mut meter = Meter::default();
        let (_, first) = run(&mut meter, 1, |_| 0.5);
        assert!(first > 0.0 && first < 0.5, "a step does not jump the RMS: {first}");
        let (_, settled) = run(&mut meter, RATE as usize / BLOCK, |_| 0.5);
        assert!((settled - 0.5).abs() < 0.01);
        let (_, falling) = run(&mut meter, 4, |_| 0.0);
        assert!(falling < settled && falling > 0.3);
    }
}
