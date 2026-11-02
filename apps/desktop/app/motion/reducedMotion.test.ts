import { afterEach, describe, expect, it, vi } from 'vitest'
import { motionDuration, prefersReducedMotion } from './reducedMotion'

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} }))
}

afterEach(() => vi.unstubAllGlobals())

describe('reduced motion', () => {
  it('short-circuits durations to zero', () => {
    expect(motionDuration(0.22, true)).toBe(0)
    expect(motionDuration(0.22, false)).toBe(0.22)
  })

  it('reads the media query when no flag is passed', () => {
    mockMatchMedia(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(motionDuration(0.14)).toBe(0)
    mockMatchMedia(false)
    expect(motionDuration(0.14)).toBe(0.14)
  })
})
