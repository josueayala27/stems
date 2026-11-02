//! Audio engine: clock, transport, mixing and routing (docs/architecture/02-audio-engine.md).
//! The real-time thread never allocates, locks or does I/O. Device output arrives in M1.

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Quantize target for a transport command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quantize {
    Now,
    Beat,
    Bar,
}

/// The first sample at or after `position` (strictly after, unless `Now`) on a grid of `step` samples.
/// Matches `nextQuantizeBoundary` in `@stems/core` for a constant tempo.
pub fn next_boundary(position: u64, step: u64, target: Quantize) -> u64 {
    match target {
        Quantize::Now => position,
        Quantize::Beat | Quantize::Bar if step == 0 => position,
        Quantize::Beat | Quantize::Bar => (position / step + 1) * step,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_boundary_moves_to_the_next_grid_line() {
        // 120 bpm at 48 kHz: one beat is 24 000 samples, one 4/4 bar 96 000.
        assert_eq!(next_boundary(1_000, 24_000, Quantize::Beat), 24_000);
        assert_eq!(next_boundary(24_000, 24_000, Quantize::Beat), 48_000);
        assert_eq!(next_boundary(1_000, 96_000, Quantize::Bar), 96_000);
        assert_eq!(next_boundary(1_000, 96_000, Quantize::Now), 1_000);
    }
}
