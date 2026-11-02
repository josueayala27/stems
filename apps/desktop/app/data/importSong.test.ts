import { describe, expect, it } from 'vitest'
import { songFromImport } from './importSong'
import type { ImportedSong } from './library'

const imported: ImportedSong = {
  title: 'Gloria',
  sampleRate: 48_000,
  durationSamples: 9_600_000,
  tempo: { bpm: 96, source: 'click' },
  tracks: [
    { name: 'Click', file: '/m/a.wav', hash: 'aa', kind: 'click', color: 'amber', sampleRate: 48_000, channels: 1, frames: 9_600_000 },
    { name: 'Bass', file: '/m/b.wav', hash: 'bb', kind: 'stem', color: 'orange', sampleRate: 44_100, channels: 2, frames: 8_820_000 },
  ],
}

function counter() {
  let n = 0
  return () => `id-${++n}`
}

describe('songFromImport', () => {
  it('builds a valid song with tracks on their default buses', () => {
    const song = songFromImport(imported, counter())
    expect(song.id).toBe('id-1')
    expect(song.title).toBe('Gloria')
    expect(song.bpm).toBe(96)
    expect(song.tempoMap).toEqual([{ sample: 0, bpm: 96, timeSignature: { numerator: 4, denominator: 4 } }])
    expect(song.tracks.map((track) => [track.id, track.name, track.defaultBus, track.color])).toEqual([
      ['id-2', 'Click', 'Click', 'amber'],
      ['id-3', 'Bass', 'FOH', 'orange'],
    ])
  })

  it('falls back to 120 bpm when analysis found no tempo', () => {
    expect(songFromImport({ ...imported, tempo: null }, counter()).bpm).toBe(120)
  })
})
