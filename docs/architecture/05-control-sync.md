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

## MIDI out (M5)

- Cue events (`Song.events`) with a MIDI action (patch change, note, CC) go to the rig's MIDI output (`Rig.midiOutput`). On macOS the first choice is a virtual `Stems` source that apps on the same Mac can read. The action's `port` field is not used yet: every cue goes to the rig's output.
- The UI resolves anchors to samples (`cueEventDocs`; marker cues follow their marker) and sends them in the song document. The engine converts them to device frames and keeps them on the song timeline.
- The mixer queues each message, fixed size and allocation free, when the play head crosses it while playing: once per pass, again on each vamp pass, at the target of a jump, never while stopped. A dedicated MIDI thread drains the queue every millisecond and sends through `midir` (CoreMIDI). A message leaves within about one buffer plus 1 ms of the audio callback that played it. A full queue counts `droppedEvents` in the state.
- A note cue is a trigger: note on, then note off straight after.
- Messages at one frame keep their order. A song-start patch change is sent as the song starts, so the synth changes before the first note when its own latency allows.
- Arrange edits cues: when (song start, a section start or a marker), message, channel and value. Patches display as 1–128.

