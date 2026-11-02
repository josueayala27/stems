import { describe, expect, it } from 'vitest'
import { fileName, formatDuration, formatRate } from './format'

describe('format', () => {
  it('formats durations, rates and file names', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(272.6)).toBe('4:33')
    expect(formatRate(48_000)).toBe('48 kHz')
    expect(formatRate(44_100)).toBe('44.1 kHz')
    expect(fileName('/Users/me/Stems/Song/01 Click.wav')).toBe('01 Click.wav')
    expect(fileName('C:\\Stems\\bass.wav')).toBe('bass.wav')
  })
})
