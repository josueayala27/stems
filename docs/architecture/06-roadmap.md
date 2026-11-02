# 06 — Roadmap

| Milestone | Scope | Exit |
|---|---|---|
| M0 Scaffold | Monorepo, blue design preset, UI kit, shell with sidebar and empty workspaces, SQLite, CI | `pnpm dev`, `pnpm desktop:dev`, `pnpm check-types`, `pnpm test` pass; every route renders |
| M1 Engine | cpal output, N stems in sample sync, transport, gain/mute/solo, device and buffer choice | 16 stems play for 30 minutes with no dropout; stop and seek are sample accurate |
| M2 Library | Stem import, waveform peaks, BPM/key analysis, Songs page | Import a 12-stem song in under 5 s; waveforms draw |
| M3 Perform | Setlists, sections, quantized jump/vamp/skip, click and guide, Play workspace | A 10-song set runs with section jumps on the bar |
| M4 Routing | Buses, routing matrix, multichannel devices, Mixer | Click and guide reach IEM channels while stems reach FOH |
| M5 Control | MIDI out/in, footswitches, LTC/MTC out, Ableton Link, Lumen sync | Lumen follows Stems' LTC; a footswitch vamps a chorus |
| M6 Tempo and key | Time-stretch, pitch-shift, tempo map | A song plays at −10% tempo and +2 semitones with clean audio |
| M7 Release | Soak tests, signed macOS build, updater | A 3-hour soak with no dropout; signed build runs offline |

Sequencing: M1 before everything that plays audio; M3 before M5 (events need sections and markers).
