import { describe, expect, it } from 'vitest'
import { barBeatToSamples, createTempoGrid, formatBarBeat, nextQuantizeBoundary, samplesToBarBeat } from './quantize'

const SR = 48_000
const fourFour = { numerator: 4, denominator: 4 } as const

// 120 bpm at 48 kHz: one beat is 24 000 samples, one 4/4 bar 96 000.
const steady = createTempoGrid({ sampleRate: SR, bpm: 120, timeSignature: fourFour })

describe('samplesToBarBeat', () => {
  it('starts at 1.1', () => {
    expect(samplesToBarBeat(steady, 0)).toEqual({ bar: 1, beat: 1, fraction: 0 })
  })

  it('counts beats and bars', () => {
    expect(samplesToBarBeat(steady, 24_000)).toMatchObject({ bar: 1, beat: 2 })
    expect(samplesToBarBeat(steady, 96_000)).toMatchObject({ bar: 2, beat: 1 })
    expect(samplesToBarBeat(steady, 96_000 + 36_000)).toEqual({ bar: 2, beat: 2, fraction: 0.5 })
  })

  it('clamps negative positions to the start', () => {
    expect(samplesToBarBeat(steady, -10)).toEqual({ bar: 1, beat: 1, fraction: 0 })
  })
})

describe('barBeatToSamples', () => {
  it('inverts samplesToBarBeat', () => {
    for (const sample of [0, 24_000, 96_000, 1_234_000]) {
      expect(barBeatToSamples(steady, samplesToBarBeat(steady, sample))).toBe(sample)
    }
  })

  it('rejects bar 0', () => {
    expect(() => barBeatToSamples(steady, { bar: 0 })).toThrow(RangeError)
  })
})

describe('tempo map', () => {
  // Two bars of 4/4 at 120, then 6/8 at 90 (one beat = 32 000 samples, one bar = 192 000).
  const changing = createTempoGrid({
    sampleRate: SR,
    bpm: 120,
    timeSignature: fourFour,
    tempoMap: [
      { sample: 0, bpm: 120, timeSignature: fourFour },
      { sample: 192_000, bpm: 90, timeSignature: { numerator: 6, denominator: 8 } },
    ],
  })

  it('continues bar numbers across a change', () => {
    expect(samplesToBarBeat(changing, 192_000)).toEqual({ bar: 3, beat: 1, fraction: 0 })
    expect(samplesToBarBeat(changing, 192_000 + 32_000 * 7)).toMatchObject({ bar: 4, beat: 2 })
  })

  it('maps bars after the change back to samples', () => {
    expect(barBeatToSamples(changing, { bar: 4, beat: 2 })).toBe(192_000 + 32_000 * 7)
  })

  it('stops a beat grid at the next tempo change', () => {
    expect(nextQuantizeBoundary(changing, 190_000, 'bar')).toBe(192_000)
  })

  it('prepends the song tempo when the map starts late', () => {
    const late = createTempoGrid({ sampleRate: SR, bpm: 120, timeSignature: fourFour, tempoMap: [{ sample: 96_000, bpm: 60, timeSignature: fourFour }] })
    expect(late.segments).toHaveLength(2)
    expect(samplesToBarBeat(late, 96_000 + 48_000)).toMatchObject({ bar: 2, beat: 2 })
  })
})

describe('nextQuantizeBoundary', () => {
  it('returns the position for now', () => {
    expect(nextQuantizeBoundary(steady, 1_000, 'now')).toBe(1_000)
  })

  it('moves to the next beat and bar, never the current one', () => {
    expect(nextQuantizeBoundary(steady, 1_000, 'beat')).toBe(24_000)
    expect(nextQuantizeBoundary(steady, 24_000, 'beat')).toBe(48_000)
    expect(nextQuantizeBoundary(steady, 1_000, 'bar')).toBe(96_000)
    expect(nextQuantizeBoundary(steady, 96_000, 'bar')).toBe(192_000)
  })

  it('uses the end of the current section, or the next bar outside sections', () => {
    const sections = [{ startSample: 0, endSample: 384_000 }]
    expect(nextQuantizeBoundary(steady, 100_000, 'section', { sections })).toBe(384_000)
    expect(nextQuantizeBoundary(steady, 400_000, 'section', { sections })).toBe(480_000)
  })

  it('uses the song end', () => {
    expect(nextQuantizeBoundary(steady, 10, 'end', { durationSamples: 500_000 })).toBe(500_000)
  })
})

describe('formatBarBeat', () => {
  it('formats bar.beat', () => {
    expect(formatBarBeat({ bar: 12, beat: 3, fraction: 0.4 })).toBe('12.3')
  })
})
