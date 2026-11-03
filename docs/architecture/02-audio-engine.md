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

## Live actions (M3)

- Two clocks. The engine clock (frames rendered) schedules commands from the control thread. The song timeline (the play head) carries armed live actions, vamps, markers and the song end.
- An armed action resolves its target sample when it is armed (`Song::boundary`, the same maths as `nextQuantizeBoundary`). One action is armed at a time; a new one replaces it.
- Jumps, seeks while playing and stops capture 5 ms of each track at the old position and crossfade (equal power) into the new one.
- Every track keeps 1.5 s in memory at each section start and marker (cue heads), next to the 5 s head, so a quantized jump plays at once while the disk thread refills from the cue's end.
- Click, guide and count-in are stateless one-shot samplers: their output is a function of the play head, so jumps and offline renders need no state. Click and guide ignore solo.
- Setlists: the control thread prepares the next song while one plays. At the end (or a `next` marker, or an end-song action) the mixer stops, auto-advances after the pre-wait with the count-in, or crossfades. Songs carry a tag so the UI follows which one is current.
- Pads loop with a blended seam and crossfade over 2 s when the setlist reaches a song with another pad.
- Guide voices are the user's WAV files (`verse.wav`, `2.wav`…). Stems ships none; `scripts/make-guide-voices.sh` makes a local set with macOS text-to-speech.

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
