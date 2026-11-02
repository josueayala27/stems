import { describe, expect, it } from 'vitest'
import { songFromImport } from './importSong'
import { summarize, writeSong } from './songs'

const song = songFromImport(
  {
    title: 'Way Maker',
    sampleRate: 48_000,
    durationSamples: 48_000 * 300,
    tempo: { bpm: 68, source: 'onsets' },
    tracks: [{ name: 'Keys', file: '/m/keys.wav', hash: 'cc', kind: 'stem', color: 'green', sampleRate: 48_000, channels: 2, frames: 48_000 * 300 }],
  },
  (() => {
    let n = 0
    return () => `id-${++n}`
  })(),
)

describe('summarize', () => {
  it('lists bpm, length, tracks and files from the document', () => {
    const summary = summarize({ id: 'id-1', title: 'Way Maker', artist: '', updated_at: 5, doc: JSON.stringify(song) })
    expect(summary).toEqual({
      id: 'id-1',
      title: 'Way Maker',
      artist: '',
      updatedAt: 5,
      bpm: 68,
      key: '',
      durationSeconds: 300,
      trackCount: 1,
      files: ['/m/keys.wav'],
    })
  })

  it('still lists a row whose document is unreadable', () => {
    const summary = summarize({ id: 'x', title: 'Broken', artist: 'A', updated_at: 1, doc: '{nope' })
    expect(summary).toMatchObject({ title: 'Broken', bpm: null, trackCount: 0, files: [] })
  })
})

describe('writeSong', () => {
  it('upserts the validated document', async () => {
    const calls: { query: string; values?: unknown[] }[] = []
    await writeSong({ execute: async (query, values) => void calls.push({ query, values }) }, song, 42)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.query).toContain('ON CONFLICT(id) DO UPDATE')
    expect(calls[0]!.values).toEqual(['id-1', 'Way Maker', '', JSON.stringify(song), 42])
  })

  it('refuses an invalid song', async () => {
    await expect(writeSong({ execute: async () => {} }, { ...song, title: '' })).rejects.toThrow()
  })
})
