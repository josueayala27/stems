# 02 — Audio engine

Crate: `apps/desktop/src-tauri/crates/stems-engine`. The engine owns the clock, the transport and every sample that reaches a device.

## Threads

- **Real-time thread** (cpal callback): mixes, applies gain and routing, advances the clock. No allocation, no locks, no I/O, no logging.
- **Disk threads**: decode with `symphonia` into lock-free ring buffers, ahead of the play head. Preload the next song in the setlist.
- **Control thread**: receives commands from Tauri, schedules them on the clock, publishes state snapshots.

Commands reach the real-time thread through a lock-free SPSC queue. State leaves it through a triple buffer read by the control thread at 60 Hz.

## Clock and transport

- Sample position is the only time. Beats and bars come from the song tempo map.
- Commands carry a quantize target: `now`, `beat`, `bar`, `section`, `end`. The engine computes the exact sample and applies it there.
- Jump, loop (vamp) and skip crossfade over a short fade (default 5 ms) to avoid clicks.
- Song end: stop, or auto-advance to the next setlist item after its pre-wait.

## Tracks and routing

- A song has N stem tracks plus generated click and guide tracks.
- Each track has gain, mute, solo and an output bus.
- Buses (for example `IEM`, `FOH`, `Click`) map to device channels in a routing matrix. Routing belongs to the rig, not the song.

## Tempo and key

- Time-stretch and pitch-shift run per track on the disk side, ahead of playback, with a high-quality library (signalsmith-stretch or Rubber Band, licence permitting).
- Click and timecode follow the stretched tempo.

## Budget

- 64 stems at 48 kHz on Apple Silicon with a 128-sample buffer, under 30% of one core.
- No dropouts in a 3-hour soak test with the UI busy.

## Tests

Rust unit tests for the clock, quantize maths, tempo map, ring buffers and routing. An offline renderer (no device) renders a song to a buffer, so tests compare samples. No device-dependent tests in CI.
