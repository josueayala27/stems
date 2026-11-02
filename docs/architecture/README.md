# Stems architecture

Stems is a desktop app for live multitrack playback. Musicians load their own stems, build setlists and play them live with click, guide, routing and show control.

Read these before changing a subsystem.

| # | Document | Covers |
|---|---|---|
| 01 | [Product](01-product.md) | Target, users, reference products, scope |
| 02 | [Audio engine](02-audio-engine.md) | Real-time thread, streaming, transport, routing, stretch |
| 03 | [Data model](03-data-model.md) | Song, track, section, setlist, routing, SQLite |
| 04 | [UI](04-ui.md) | Workspaces, layouts, design system |
| 05 | [Control and sync](05-control-sync.md) | MIDI, footswitches, timecode, Ableton Link, Lumen |
| 06 | [Roadmap](06-roadmap.md) | Milestones M0–M7 |

## Invariants

1. Audio never stops because of the UI. The real-time thread never allocates, locks or does I/O.
2. Playback works with no network.
3. The Rust engine is the clock. The UI shows engine state; it never keeps its own transport time.
4. Every jump, loop and cue is sample accurate and quantized to the engine clock.
5. Stems are the user's own files. Stems ships no third-party content.
6. Design tokens are copied from Lumen (`@lumen/design`) and stay identical, except the accent, which is blue.
