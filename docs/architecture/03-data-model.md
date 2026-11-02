# 03 — Data model

Zod schemas live in `packages/schema`. Pure logic (arrangement, quantize, setlist order) lives in `packages/core`. SQLite through the Tauri SQL plugin is the only store.

```
Song {
  id, title, artist, bpm, key, timeSignature, durationSamples, sampleRate
  tempoMap: { sample, bpm, timeSignature }[]
  tracks: Track[]
  sections: Section[]          intro, verse, chorus, bridge, outro, custom name
  markers: Marker[]            cue points with actions
  events: CueEvent[]           MIDI, timecode, Lumen, at a sample or marker
}
Track { id, name, file, hash, kind: stem | click | guide, gain, mute, color, defaultBus }
Section { id, name, startSample, endSample, color, loopable }
Setlist { id, name, items: { songId, transition: stop | auto | crossfade, preWaitMs, padId | null }[] }
Rig { id, name, device, sampleRate, bufferSize, buses: Bus[], routing: { bus, channels[] }[] }
```

Media files stay on disk. The database stores paths and hashes and relinks missing files by hash.
