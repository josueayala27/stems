import { describe, expect, it } from 'vitest'
import { rigSchema, sectionSchema, setlistSchema, songSchema, trackSchema } from './index'

const fourFour = { numerator: 4, denominator: 4 } as const

function song(overrides: Record<string, unknown> = {}) {
  return {
    id: 'song-1',
    title: 'Opener',
    bpm: 120,
    timeSignature: fourFour,
    durationSamples: 48_000 * 180,
    sampleRate: 48_000,
    ...overrides,
  }
}

describe('songSchema', () => {
  it('fills defaults for a minimal song', () => {
    const parsed = songSchema.parse(song())
    expect(parsed.artist).toBe('')
    expect(parsed.tracks).toEqual([])
    expect(parsed.sections).toEqual([])
    expect(parsed.events).toEqual([])
  })

  it('parses tracks, sections, markers and cue events', () => {
    const parsed = songSchema.parse(
      song({
        tempoMap: [
          { sample: 0, bpm: 120, timeSignature: fourFour },
          { sample: 96_000, bpm: 90, timeSignature: { numerator: 6, denominator: 8 } },
        ],
        tracks: [{ id: 't1', name: 'Drums', file: '/stems/drums.wav', hash: 'abc', kind: 'stem', color: '#fff', defaultBus: 'FOH' }],
        sections: [{ id: 's1', name: 'Intro', startSample: 0, endSample: 96_000, color: '#000' }],
        markers: [{ id: 'm1', name: 'Hit', sample: 48_000 }],
        events: [
          { id: 'e1', at: { kind: 'marker', markerId: 'm1' }, action: { kind: 'midiProgram', port: 'Synth', channel: 1, program: 12 } },
          { id: 'e2', at: { kind: 'sample', sample: 0 }, action: { kind: 'timecode', offsetMs: 0 } },
        ],
      }),
    )
    expect(parsed.tracks[0]?.gain).toBe(1)
    expect(parsed.tracks[0]?.mute).toBe(false)
    expect(parsed.sections[0]?.loopable).toBe(true)
    expect(parsed.markers[0]?.action).toBe('none')
  })

  it('rejects an unsorted tempo map', () => {
    const result = songSchema.safeParse(
      song({
        tempoMap: [
          { sample: 1000, bpm: 120, timeSignature: fourFour },
          { sample: 500, bpm: 100, timeSignature: fourFour },
        ],
      }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects an event on an unknown marker', () => {
    const result = songSchema.safeParse(
      song({ events: [{ id: 'e1', at: { kind: 'marker', markerId: 'missing' }, action: { kind: 'lumen', message: 'next' } }] }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects an odd time signature denominator', () => {
    expect(songSchema.safeParse(song({ timeSignature: { numerator: 4, denominator: 3 } })).success).toBe(false)
  })
})

describe('trackSchema', () => {
  it('only accepts known kinds', () => {
    const base = { id: 't', name: 'Click', file: '', hash: '', color: '#fff', defaultBus: 'Click' }
    expect(trackSchema.safeParse({ ...base, kind: 'click' }).success).toBe(true)
    expect(trackSchema.safeParse({ ...base, kind: 'video' }).success).toBe(false)
  })
})

describe('sectionSchema', () => {
  it('requires end after start', () => {
    expect(sectionSchema.safeParse({ id: 's', name: 'Verse', startSample: 10, endSample: 10, color: '#fff' }).success).toBe(false)
  })
})

describe('setlistSchema', () => {
  it('defaults item transitions', () => {
    const parsed = setlistSchema.parse({ id: 'l', name: 'Friday', items: [{ songId: 'song-1' }] })
    expect(parsed.items[0]).toEqual({ songId: 'song-1', transition: 'stop', preWaitMs: 0, crossfadeMs: 4000, pad: null })
  })
})

describe('rigSchema', () => {
  const rig = {
    id: 'r',
    name: 'Tour rig',
    device: 'Aggregate',
    sampleRate: 48_000,
    bufferSize: 128,
    buses: [
      { id: 'b1', name: 'FOH' },
      { id: 'b2', name: 'IEM' },
    ],
    routing: [
      { bus: 'FOH', channels: [0, 1] },
      { bus: 'IEM', channels: [2, 3] },
    ],
  }

  it('parses a valid rig', () => {
    expect(rigSchema.parse(rig).routing).toHaveLength(2)
  })

  it('rejects a route to an unknown bus', () => {
    expect(rigSchema.safeParse({ ...rig, routing: [{ bus: 'Click', channels: [4] }] }).success).toBe(false)
  })

  it('rejects duplicate bus names and odd buffer sizes', () => {
    expect(rigSchema.safeParse({ ...rig, buses: [...rig.buses, { id: 'b3', name: 'FOH' }] }).success).toBe(false)
    expect(rigSchema.safeParse({ ...rig, bufferSize: 100 }).success).toBe(false)
  })
})
