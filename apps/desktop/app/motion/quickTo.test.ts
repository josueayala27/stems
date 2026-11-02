import { afterEach, describe, expect, it, vi } from 'vitest'
import { gsap } from './gsap'
import { quickTo } from './quickTo'

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} }))
}

afterEach(() => vi.unstubAllGlobals())

describe('quickTo', () => {
  it('sets instantly under reduced motion', () => {
    mockReducedMotion(true)
    const el = document.createElement('div')
    const q = quickTo(el, 'x')
    q.set(42)
    expect(gsap.getProperty(el, 'x')).toBe(42)
    q.dispose()
  })

  it('tweens towards the target otherwise and disposes cleanly', () => {
    mockReducedMotion(false)
    const el = document.createElement('div')
    const q = quickTo(el, 'y', { duration: 'slow' })
    q.set(100)
    expect(gsap.isTweening(el)).toBe(true)
    expect(gsap.getProperty(el, 'y')).not.toBe(100)
    q.dispose()
    expect(gsap.isTweening(el)).toBe(false)
  })
})
