//! Show control: MIDI in and out, LTC and MTC, Ableton Link (docs/architecture/05-control-sync.md).
//! Events are scheduled on the engine clock, never on a UI timer. Devices arrive in M5.

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// A MIDI program change message on a 1-based channel.
pub fn program_change(channel: u8, program: u8) -> Option<[u8; 2]> {
    if !(1..=16).contains(&channel) || program > 127 {
        return None;
    }
    Some([0xC0 | (channel - 1), program])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn program_change_encodes_channel_and_program() {
        assert_eq!(program_change(1, 12), Some([0xC0, 12]));
        assert_eq!(program_change(16, 127), Some([0xCF, 127]));
        assert_eq!(program_change(0, 1), None);
        assert_eq!(program_change(1, 128), None);
    }
}
