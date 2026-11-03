import { describe, expect, it } from 'vitest'
import { setlistSchema } from '@stems/schema'
import { songFromImport } from '~/data/importSong'
import { readOptions, DEFAULT_OPTIONS } from './options'
import { fromEngine, padAt, songDoc, toEngine, transitionDoc } from './songDoc'

const song = {
  ...songFromImport({
    title: 'Song',
    sampleRate: 44_100,
    durationSamples: 441_000,
    tempo: { bpm: 100, source: 'click' },
    tracks: [{ name: 'Bass', file: '/m/bass.wav', hash: 'a', kind: 'stem', color: 'orange', sampleRate: 44_100, channels: 2, frames: 441_000 }],
  }),
  sections: [
    { id: 's2', name: 'Chorus', startSample: 200_000, endSample: 300_000, color: 'red', loopable: true },
    { id: 's1', name: 'Verse', startSample: 0, endSample: 200_000, color: 'blue', loopable: true },
  ],
  markers: [{ id: 'm', name: 'End', sample: 400_000, action: 'stop' as const }],
}

describe('songDoc', () => {
  it('sends tracks, sorted sections and markers', () => {
    const doc = songDoc(song)
    expect(doc.sampleRate).toBe(44_100)
    expect(doc.tracks).toEqual([{ file: '/m/bass.wav', kind: 'stem', gain: 1, mute: false }])
    expect(doc.sections.map((section) => section.name)).toEqual(['Verse', 'Chorus'])
    expect(doc.markers).toEqual([{ sample: 400_000, action: 'stop' }])
  })
})

describe('setlist helpers', () => {
  const setlist = setlistSchema.parse({
    id: 'set',
    name: 'Sunday',
    items: [
      { songId: 'a', pad: { file: '/pads/C.wav', name: 'C' } },
      { songId: 'b', transition: 'crossfade', crossfadeMs: 2_000 },
      { songId: 'c', pad: { file: '/pads/G.wav', name: 'G' } },
    ],
  })

  it('keeps the last pad until a song sets another', () => {
    expect([0, 1, 2].map((index) => padAt(setlist, index))).toEqual(['/pads/C.wav', '/pads/C.wav', '/pads/G.wav'])
  })

  it('maps setlist items to engine transitions', () => {
    expect(transitionDoc(setlist.items[1]!)).toEqual({ kind: 'crossfade', preWaitMs: 0, crossfadeMs: 2_000 })
  })

  it('converts between song and device rates', () => {
    expect(toEngine(44_100, 44_100, 48_000)).toBe(48_000)
    expect(fromEngine(48_000, 44_100, 48_000)).toBe(44_100)
    expect(toEngine(10, 0, 48_000)).toBe(10)
  })
})

describe('readOptions', () => {
  it('merges saved options over the defaults', () => {
    expect(readOptions(null)).toEqual(DEFAULT_OPTIONS)
    expect(readOptions('{"click":{"gain":0.5}}').click).toEqual({ ...DEFAULT_OPTIONS.click, gain: 0.5 })
    expect(readOptions('not json')).toEqual(DEFAULT_OPTIONS)
  })
})
