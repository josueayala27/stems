# 01 — Product

## Target

One app that plays a live set of backing tracks: stems per song, click and guide to in-ear monitors, tracks to front of house, and cues to lights, video and synths. It must survive a whole show with no dropouts.

Reference products, combined:

| Area | Reference | Stems takes |
|---|---|---|
| Multitrack playback for bands | Prime, MultiTracks Playback | Setlists, sections, vamp, click and guide, routing |
| Live sets | Ableton Live, MainStage | Tempo and key, Link, MIDI program changes |
| Show running | QLab | Cues, timecode out, network control |
| Recording and stems | Reaper | Track lanes, waveforms, solid engine |

Users: touring bands, worship teams, theatre, solo artists, musical directors. No market owns the core; integrations for one market ship as packs.

## In scope

- Songs made of stems (WAV, AIFF, FLAC, MP3, M4A) with sections, markers, tempo and key.
- Setlists with transitions, pads between songs, auto-advance.
- Live control: jump to section, vamp/loop, skip, stop at end of section, all quantized (beat, bar, section).
- Click (generated) and guide (spoken cues) tracks.
- Multichannel output routing to any device channels.
- MIDI out (program changes, notes, CC) and MIDI in (footswitches, controllers).
- LTC and MTC out, Ableton Link, and sync with Lumen.
- Tempo change with time-stretch, key change with pitch-shift.

## Out of scope for now

- Recording, editing audio, plug-ins.
- A content store. Users import their own stems.
- Cloud sync. Comes after M7.

## Platform

macOS first (CoreAudio, aggregate devices). Windows (ASIO/WASAPI) after M7.
