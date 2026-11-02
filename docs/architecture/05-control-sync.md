# 05 — Control and sync

Crate: `apps/desktop/src-tauri/crates/stems-control`. Events are scheduled on the engine clock, never on a UI timer.

- **MIDI out** (`midir`): program changes, notes and CC at markers or song start, to synths, lighting consoles and Lumen.
- **MIDI in**: footswitches and controllers map to transport commands (play, stop, next section, vamp, next song).
- **Timecode out**: LTC on a chosen output channel and MTC on a MIDI port, following the song or a setlist-wide offset.
- **Ableton Link**: join a Link session; tempo and phase follow Link or lead it.
- **Lumen**: Lumen follows Stems through LTC/MTC (already supported in Lumen's `lumen-control`). A later OSC link sends song and section changes.
