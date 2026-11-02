import { describe, expect, it } from 'vitest'
import { accumulateScrub, nudge, scrubMultiplier } from './scrub'

const none = { shift: false, alt: false }
const config = { step: 1, pixelsPerStep: 2 }

describe('scrub math', () => {
  it('picks the modifier multiplier', () => {
    expect(scrubMultiplier(none)).toBe(1)
    expect(scrubMultiplier({ shift: true, alt: false })).toBe(10)
    expect(scrubMultiplier({ shift: false, alt: true })).toBe(0.1)
  })

  it('accumulates sub-step travel', () => {
    let state = { value: 10, remainder: 0 }
    state = accumulateScrub(state, 1, none, config)
    expect(state).toEqual({ value: 10, remainder: 1 })
    state = accumulateScrub(state, 1, none, config)
    expect(state).toEqual({ value: 11, remainder: 0 })
    state = accumulateScrub(state, -5, none, config)
    expect(state.value).toBe(9)
    expect(state.remainder).toBe(-1)
  })

  it('applies modifiers, clamps and avoids float noise', () => {
    expect(accumulateScrub({ value: 0, remainder: 0 }, 4, { shift: true, alt: false }, config).value).toBe(20)
    expect(accumulateScrub({ value: 0, remainder: 0 }, 6, { shift: false, alt: true }, config).value).toBe(0.3)
    expect(accumulateScrub({ value: 98, remainder: 0 }, 20, none, { ...config, max: 100 }).value).toBe(100)
  })

  it('nudges by keyboard', () => {
    expect(nudge(5, 1, none, { step: 1 })).toBe(6)
    expect(nudge(5, -1, { shift: true, alt: false }, { step: 1, min: 0 })).toBe(0)
    expect(nudge(0.2, 1, { shift: false, alt: true }, { step: 1 })).toBe(0.3)
  })
})
