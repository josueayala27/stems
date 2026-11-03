import { describe, expect, it } from 'vitest'
import { songFromImport } from '~/data/importSong'
import { engineSections, sectionIndexAt, skipTarget, type Span } from './player'

const sections: Span[] = [
  { name: 'Intro', start: 0, end: 100 },
  { name: 'Verse', start: 100, end: 200 },
  { name: 'Chorus', start: 200, end: 300 },
  { name: 'Outro', start: 300, end: 400 },
]

describe('sections', () => {
  it('finds the section under the play head', () => {
    expect(sectionIndexAt(sections, 0)).toBe(0)
    expect(sectionIndexAt(sections, 199)).toBe(1)
    expect(sectionIndexAt(sections, 400)).toBe(-1)
  })

  it('skips the next section', () => {
    expect(skipTarget(sections, 50)?.name).toBe('Chorus')
    expect(skipTarget(sections, 250)).toBeNull()
  })

  it('converts sections to engine frames, sorted', () => {
    const song = {
      ...songFromImport({ title: 'S', sampleRate: 44_100, durationSamples: 441_000, tempo: null, tracks: [] }),
      sections: [
        { id: 'b', name: 'Chorus', startSample: 44_100, endSample: 88_200, color: 'red', loopable: true },
        { id: 'a', name: 'Verse', startSample: 0, endSample: 44_100, color: 'blue', loopable: true },
      ],
    }
    expect(engineSections(song, 48_000)).toEqual([
      { name: 'Verse', start: 0, end: 48_000 },
      { name: 'Chorus', start: 48_000, end: 96_000 },
    ])
  })
})
