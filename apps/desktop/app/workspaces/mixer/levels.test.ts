import { describe, expect, it } from 'vitest'
import { clips, faderToGain, formatDb, gainToFader, meterFraction } from './levels'

describe('faders', () => {
  it('maps the travel to -60…+6 dB with off at the bottom', () => {
    expect(faderToGain(0)).toBe(0)
    expect(faderToGain(100)).toBeCloseTo(10 ** (6 / 20))
    expect(gainToFader(1)).toBe(91)
    expect(gainToFader(0)).toBe(0)
  })

  it('round-trips positions', () => {
    for (const position of [1, 25, 50, 91, 100]) expect(gainToFader(faderToGain(position))).toBe(position)
  })

  it('formats dB with a true minus sign', () => {
    expect(formatDb(1)).toBe('0.0 dB')
    expect(formatDb(0.5)).toBe('−6.0 dB')
    expect(formatDb(2)).toBe('+6.0 dB')
    expect(formatDb(0)).toBe('−∞')
  })
})

describe('meters', () => {
  it('fills on a 60 dB scale and flags clipping', () => {
    expect(meterFraction(0)).toBe(0)
    expect(meterFraction(1)).toBe(1)
    expect(meterFraction(0.001)).toBeCloseTo(0)
    expect(meterFraction(10 ** (-30 / 20))).toBeCloseTo(0.5)
    expect(clips(1)).toBe(true)
    expect(clips(0.99)).toBe(false)
  })
})
