import { describe, expect, it } from 'vitest'
import { songFromImport } from '~/data/importSong'
import { trackCommands } from './player'

const song = songFromImport({
  title: 'Song',
  sampleRate: 48_000,
  durationSamples: 48_000,
  tempo: null,
  tracks: ['Click', 'Bass', 'Keys'].map((name, i) => ({
    name,
    file: `/m/${i}.wav`,
    hash: `${i}`,
    kind: 'stem' as const,
    color: 'blue',
    sampleRate: 48_000,
    channels: 2,
    frames: 48_000,
  })),
})

describe('trackCommands', () => {
  it('sends nothing for tracks at unity and unmuted', () => {
    expect(trackCommands(song)).toEqual([])
  })

  it('restores saved gain and mute by track index', () => {
    const edited = {
      ...song,
      tracks: song.tracks.map((track, i) => (i === 0 ? { ...track, mute: true } : i === 2 ? { ...track, gain: 0.5 } : track)),
    }
    expect(trackCommands(edited)).toEqual([
      { type: 'mute', track: 0, muted: true },
      { type: 'gain', track: 2, gain: 0.5 },
    ])
  })
})
