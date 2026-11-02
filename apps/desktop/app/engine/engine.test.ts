import { describe, expect, it } from 'vitest'
import { engine, formatFrames, positionSeconds } from './engine'

describe('formatFrames', () => {
  it('formats minutes, seconds and tenths', () => {
    expect(formatFrames(0, 48_000)).toBe('0:00.0')
    expect(formatFrames(48_000 * 75.55, 48_000)).toBe('1:15.5')
    expect(formatFrames(48_000 * 600, 48_000)).toBe('10:00.0')
  })

  it('shows zero without a sample rate', () => {
    expect(formatFrames(1_000, 0)).toBe('0:00.0')
  })
})

describe('positionSeconds', () => {
  it('converts the play head to seconds', () => {
    expect(positionSeconds({ position: 96_000, sampleRate: 48_000 })).toBe(2)
  })
})

describe('engine', () => {
  it('refuses calls outside the desktop app', async () => {
    await expect(engine.devices()).rejects.toThrow('desktop app')
  })
})
