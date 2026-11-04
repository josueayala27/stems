# 05 — Control and sync

Crate: `apps/desktop/src-tauri/crates/stems-control`. Events are scheduled on the engine clock, never on a UI timer.

- **MIDI out** (`midir`): program changes, notes and CC at markers or song start, to synths, lighting consoles and Lumen.
- **MIDI in**: footswitches and controllers map to transport commands (play, stop, next section, vamp, next song).
- **Timecode out**: LTC on a chosen output channel and MTC on a MIDI port, following the song or a setlist-wide offset.

## LTC out (M5)

- `stems-control` encodes SMPTE 12M frames (`ltc.rs`): BCD fields at their standard bit positions, the drop-frame flag (bit 10), the `0x3FFD` sync word and the polarity bit (27, or 59 at 25 fps) that keeps the ones in each frame even.
- Because every frame starts at the same level, the signal is a function of the play head (`LtcGenerator`). The engine plays it as a generated track (`TrackRole::Timecode`) after click and guide: it jumps with jumps and vamps, stops with the transport, and is never crossfaded (a blend of two timecodes decodes as neither). In a setlist crossfade the outgoing song's LTC stops at once.
- Rates: 23.976, 24, 25, 29.97, 29.97 drop-frame and 30, named as in Lumen.
- The label at song start is `PerformOptions.timecode.start` (default `01:00:00:00`), or the song's `timecodeStart`. With "hour per song" the UI sends `n:00:00:00` for setlist song n.
- LTC plays only into the rig's `timecodeBus`. With none, or a name the rig lacks, it plays nowhere: it never falls back to a bus the audience hears. `routingWarnings` flags an LTC bus that is front of house or shared with the click or guide.
- `ltc::LtcDecoder` decodes SMPTE LTC for tests and loopback checks.
- **Ableton Link**: join a Link session; tempo and phase follow Link or lead it.
- **Lumen**: Lumen follows Stems through LTC/MTC (already supported in Lumen's `lumen-control`). A later OSC link sends song and section changes.
