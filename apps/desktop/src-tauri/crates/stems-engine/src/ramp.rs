/// Frames a gain change takes to reach its target. 128 frames is one block at the default
/// buffer size; a fixed length keeps offline renders independent of the block size.
pub const RAMP_FRAMES: u32 = 128;

/// A linear gain ramp, so gain, mute and solo changes never step (no zipper noise).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ramp {
    current: f32,
    target: f32,
    step: f32,
    remaining: u32,
}

impl Ramp {
    pub fn new(value: f32) -> Self {
        Self { current: value, target: value, step: 0.0, remaining: 0 }
    }

    /// Start a ramp to `target`. A target equal to the current one changes nothing.
    pub fn set(&mut self, target: f32) {
        if target == self.target {
            return;
        }
        self.target = target;
        self.remaining = RAMP_FRAMES;
        self.step = (target - self.current) / RAMP_FRAMES as f32;
    }

    /// The gain for the next frame.
    #[inline]
    pub fn next_gain(&mut self) -> f32 {
        if self.remaining > 0 {
            self.remaining -= 1;
            self.current = if self.remaining == 0 { self.target } else { self.current + self.step };
        }
        self.current
    }

    pub fn value(&self) -> f32 {
        self.current
    }

    pub fn target(&self) -> f32 {
        self.target
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reaches_the_target_exactly_after_ramp_frames() {
        let mut ramp = Ramp::new(1.0);
        ramp.set(0.0);
        let gains: Vec<f32> = (0..RAMP_FRAMES + 4).map(|_| ramp.next_gain()).collect();
        assert!(gains.windows(2).all(|pair| pair[1] <= pair[0]));
        assert!(gains[0] < 1.0 && gains[0] > 0.98);
        assert_eq!(gains[RAMP_FRAMES as usize - 1], 0.0);
        assert_eq!(*gains.last().unwrap(), 0.0);
    }

    #[test]
    fn a_settled_ramp_returns_its_value_unchanged() {
        let mut ramp = Ramp::new(0.5);
        ramp.set(0.5);
        assert!((0..10).all(|_| ramp.next_gain() == 0.5));
    }
}
