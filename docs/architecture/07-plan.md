# 07 — Delivery plan

The detailed plan for M1–M7 after the M0 scaffold. Each milestone lists its work, the key decisions, the tests and the exit check. Milestones run in order unless noted. `06-roadmap.md` is the summary.

## M1 — Engine

Goal: play N stems of one song in sample sync through one device, with transport and per-track gain.

Work (`stems-engine`):
- **Device layer:** `cpal` on CoreAudio. List devices, channel counts and sample rates. Open a stream with a chosen buffer size (64–1024). Reopen on device loss.
- **Real-time core:** an `Engine` that owns the mix state. Commands arrive through an `rtrb` SPSC queue; state leaves through a `triple_buffer`. Gain changes ramp over one block to avoid zipper noise.
- **Scheduling:** each command carries a target sample. The callback splits a block at the target, so jumps and stops land on the exact sample.
- **Disk streaming:** one reader thread per song. `symphonia` decodes, `rubato` resamples when the file rate differs from the device rate, and each track fills an `rtrb` ring with about 2 s of lookahead. The first 5 s of each track stay in memory, so play starts at once.
- **Offline renderer:** `Engine::render(frames)` runs the same mix code with no device. Tests and analysis use it.
- **Tauri commands:** `engine_devices`, `engine_open`, `engine_load_song`, `engine_command` (play, stop, seek, gain, mute, solo) and an `engine://state` event at 60 Hz (position, playing, xruns, CPU load, meters).

Tests:
- Offline render of synthetic stems matches the expected sum sample for sample.
- A scheduled seek lands on its target sample.
- `assert_no_alloc` wraps the mix function in debug tests.
- Ring buffer underrun is reported, not silent.

Exit: 16 stems play for 30 minutes with no xrun at a 128-sample buffer; stop and seek are sample accurate in offline tests.

## M2 — Library

Goal: import a folder of stems as a song and see it.

Work:
- **Import** (`stems-library`): pick a folder or files. Probe each file (format, rate, channels, length). Hash with `blake3`. Choose copy into the library folder or reference in place. Guess the track kind and colour from the file name (`click`, `guide`, `cue`, `drums`, `bass`, `keys`…). Reject files with mismatched lengths beyond a tolerance and say which.
- **Peaks:** compute min/max peaks at several zoom levels in a background thread and store them as binary files next to the database. The UI never decodes audio.
- **Analysis:** BPM from the click track when there is one, otherwise from onset autocorrelation. Key stays manual in M2. Every value can be overridden.
- **Relink:** missing files are found again by hash in a chosen folder.
- **Songs page:** `DataTable` of songs (title, artist, BPM, key, length, tracks, status), the import dialog with `FileDrop`, a song detail sheet with tracks and waveforms.

Tests: probe and hash fixtures, name heuristics, peak maths, BPM on generated click tracks.

Exit: a 12-stem song imports in under 5 s on Apple Silicon; waveforms draw at every zoom.

## M3 — Perform

Goal: run a whole set with sections, click and guide.

Work:
- **Sections and markers:** the Arrange workspace edits sections on a waveform overview. Boundaries snap to bars from the tempo map. Markers carry actions (stop, jump, loop).
- **Live actions** (engine): jump to section, vamp (loop the current section until released), skip next section, stop at end of section, each with a quantize target (`now`, `beat`, `bar`, `section`, `end`). Every jump crossfades over 5 ms.
- **Click:** generated in the engine from the tempo map. Accented downbeat, subdivisions, count-in, choice of sounds. Click follows tempo changes.
- **Guide:** spoken section cues ("verse", "chorus", "two, three, four") placed one bar before each section. Voices come from bundled samples recorded or generated under a licence that allows redistribution. Users can import their own.
- **Setlists:** `SortableList` editor; per item transition (stop, auto-advance, crossfade) and pre-wait. The engine preloads the next song while the current one plays.
- **Pads:** an optional ambient loop that crossfades between songs.
- **Play workspace:** setlist rail, section strip (click to jump, hold to vamp), track lanes drawn on canvas from peaks, a play head interpolated between engine state events, the transport bar and large hit targets. A performance lock stops accidental edits during a show.

Tests: quantize maths, section jump targets, vamp loop points, click sample positions, setlist advance logic.

Exit: a 10-song set runs start to finish with section jumps on the bar and click in time.

## M4 — Routing and mixer

Goal: send each track and the click to the right outputs.

Work:
- **Buses:** named buses (`FOH`, `IEM`, `Click`, `Guide`…) with gain, mute and meters. Tracks pick a bus; the rig maps buses to device channels.
- **Rig:** saved per machine. It stores the device, the rate, the buffer and the routing. Songs never store channels.
- **Multichannel:** any channel count the device exposes. Aggregate devices on macOS are supported; the Settings page explains how to make one.
- **Meters:** peak and RMS per track and bus, written by the real-time thread to atomics and read at 60 Hz.
- **Mixer workspace:** fader strips, mute/solo, bus strips, and a routing matrix (buses × channels).
- **Safety:** warn when click or guide routes to a bus marked as front of house.

Tests: routing matrix maths, mono/stereo fold rules, meter ballistics.

Exit: click and guide reach the in-ear channels while stems reach front of house on a 16-out interface.

## M5 — Control and sync

Goal: drive and be driven by other gear on the engine clock.

Work (`stems-control`):
- **MIDI out:** program changes, notes and CC from song events and markers. On macOS use `coremidi` timestamps so events leave on time; elsewhere `midir` with a lookahead sender thread.
- **MIDI in:** learn mode maps footswitches and controllers to transport actions.
- **LTC out:** the engine renders LTC into an audio bus, sample accurate, at 24, 25, 29.97 DF or 30 fps. A song or setlist offset sets the start time.
- **MTC out:** quarter-frame messages on a MIDI port, with a full frame on locate.
- **Ableton Link:** join a session; follow or lead tempo and phase.
- **Lumen:** Lumen already follows LTC and MTC (`lumen-control`). Document a tested setup. An OSC link that sends song and section changes comes later.

Tests: LTC encoder against Lumen's decoder (shared fixtures), MTC quarter-frame order, MIDI event scheduling maths.

Exit: Lumen follows Stems' LTC through a full song; a footswitch vamps a chorus; a synth changes patch at each song.

## M6 — Tempo and key

Goal: change tempo and key live with clean audio.

Work:
- **Stretch:** Signalsmith Stretch (MIT) through Rust bindings, per track, on the disk side ahead of playback. Rubber Band is not used because of its GPL licence.
- **Controls:** tempo as a percentage or a target BPM, and key in semitones, per song with a live override.
- **Tempo map:** songs with tempo changes keep click, sections and timecode aligned.
- **Latency:** the stretcher's latency is compensated so tracks stay aligned.
- **CPU:** stretch work is skipped at 100% tempo and 0 semitones.

Tests: offline renders at several ratios check length and alignment between tracks.

Exit: a song plays at −10% tempo and +2 semitones with all tracks aligned and no audible artefacts on a listening test.

## M7 — Release

Goal: a build you can take on tour.

Work:
- **Soak tests:** a 3-hour run that plays a setlist with random section jumps while the UI is busy. It records xruns, CPU and memory.
- **Recovery:** after a crash, reopen at the last song and section. Audio settings come back without prompts.
- **Device faults:** device loss and return during playback are handled without a restart.
- **Release:** signed and notarized macOS build, `tauri-plugin-updater` with stable and beta channels. Updates never install during a show.
- **Docs:** a setup guide for interfaces, aggregate devices, routing and Lumen sync.

Exit: a 3-hour soak with no xrun; a signed build runs a full set offline.

## After M7

- Windows: WASAPI first, ASIO when the SDK licence is settled.
- Remote: a LAN web remote and an iPad layout for the musical director.
- Cloud: library sync between machines and shared setlists.
- OSC link with Lumen: song, section and marker events.

## Risks

| Risk | Plan |
|---|---|
| Real-time safety in Rust (hidden allocation or locks) | `assert_no_alloc` in tests; no `Vec` growth, `Mutex` or logging in the callback; review every change to the mix path |
| Ableton Link licence (GPLv2 or a commercial licence from Ableton) | Get the commercial licence before shipping Link, or ship M5 without Link |
| Guide voice licences | Use only voices whose licence allows redistribution; record our own if needed |
| MIDI timing jitter | Timestamped CoreMIDI sends; measure jitter in M5 |
| Disk throughput with many stems | Lookahead rings, in-memory song starts, and an SSD requirement in the docs |
| Aggregate device drift | Document drift correction settings; test with two interfaces |
