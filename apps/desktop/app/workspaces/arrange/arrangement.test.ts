import { describe, expect, it } from 'vitest'
import { songSchema } from '@stems/schema'
import { songFromImport } from '~/data/importSong'
import { addMarker, appendSection, barCount, gridFor, nextSectionName, setSectionBars, setTempo, snapToBar, splitAt } from './arrangement'

// 120 bpm 4/4 at 48 kHz: one bar is 96 000 samples. 40 bars long.
const BAR = 96_000
const base = songFromImport(
  { title: 'S', sampleRate: 48_000, durationSamples: 40 * BAR, tempo: { bpm: 120, source: 'click' }, tracks: [] },
  (() => {
    let n = 0
    return () => `id-${++n}`
  })(),
)
const ids = () => {
  let n = 0
  return () => `new-${++n}`
}

describe('arrangement', () => {
  it('snaps to the nearest bar line', () => {
    const grid = gridFor(base)
    expect(snapToBar(grid, 40_000)).toBe(0)
    expect(snapToBar(grid, 50_000)).toBe(BAR)
    expect(barCount(base)).toBe(40)
  })

  it('appends sections of eight bars with the next name', () => {
    const one = appendSection(base, ids())
    expect(one).toMatchObject([{ name: 'Intro', startSample: 0, endSample: 8 * BAR }])
    const two = appendSection({ ...base, sections: one }, ids())
    expect(two[1]).toMatchObject({ name: 'Verse', startSample: 8 * BAR, endSample: 16 * BAR })
    expect(nextSectionName([{ id: 'c', name: 'Chorus 2', startSample: 0, endSample: 1, color: 'red', loopable: true }])).toBe('Bridge')
  })

  it('clips the last section to the song end', () => {
    const sections = appendSection({ ...base, sections: [{ id: 'a', name: 'Verse', startSample: 0, endSample: 36 * BAR, color: 'blue', loopable: true }] }, ids())
    expect(sections[1]).toMatchObject({ startSample: 36 * BAR, endSample: 40 * BAR })
  })

  it('splits a section on a bar line', () => {
    const song = { ...base, sections: appendSection(base, ids()) }
    const split = splitAt(song, 3 * BAR + 10_000, ids())
    expect(split.map((s) => [s.name, s.startSample, s.endSample])).toEqual([
      ['Intro', 0, 3 * BAR],
      ['Verse', 3 * BAR, 8 * BAR],
    ])
    expect(splitAt(song, 0, ids())).toHaveLength(1)
  })

  it('edits bars and keeps sections valid', () => {
    const song = { ...base, sections: appendSection(base, ids()) }
    const id = song.sections[0]!.id
    expect(setSectionBars(song, id, 3, 5)[0]).toMatchObject({ startSample: 2 * BAR, endSample: 4 * BAR })
    // An end before the start becomes one bar long.
    expect(setSectionBars(song, id, 5, 2)[0]).toMatchObject({ startSample: 4 * BAR, endSample: 5 * BAR })
    expect(() => songSchema.parse({ ...song, sections: setSectionBars(song, id, 5, 2) })).not.toThrow()
  })

  it('adds markers on bar lines', () => {
    expect(addMarker(base, 2 * BAR + 100, ids())).toMatchObject([{ sample: 2 * BAR, action: 'stop' }])
  })

  it('keeps sections on their bars when the tempo changes', () => {
    const song = { ...base, sections: appendSection(base, ids()) }
    const slower = setTempo(song, 60, 4, 4)
    expect(slower.tempoMap).toEqual([{ sample: 0, bpm: 60, timeSignature: { numerator: 4, denominator: 4 } }])
    // 8 bars at 60 bpm is 32 s = 1 536 000 samples.
    expect(slower.sections[0]).toMatchObject({ startSample: 0, endSample: 1_536_000 })
    expect(setTempo(song, 0, 4, 4)).toBe(song)
  })
})
