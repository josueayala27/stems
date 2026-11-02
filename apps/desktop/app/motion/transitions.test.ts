import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransitionHooks } from './transitions'

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} }))
}

afterEach(() => vi.unstubAllGlobals())

describe('transition hooks', () => {
  it('stops a leaving element from intercepting pointer events as soon as it starts leaving', () => {
    mockReducedMotion(false)
    const hooks = createTransitionHooks('slideUp')
    const el = document.createElement('section')
    const done = vi.fn()
    hooks.onLeave(el, done)
    expect(el.style.pointerEvents).toBe('none')
    expect(done).not.toHaveBeenCalled()
  })

  it('restores pointer events when the element enters again or the leave is cancelled', () => {
    mockReducedMotion(false)
    const hooks = createTransitionHooks('slideUp')
    const el = document.createElement('section')
    hooks.onLeave(el, () => {})
    hooks.onLeaveCancelled(el)
    expect(el.style.pointerEvents).toBe('')
    hooks.onLeave(el, () => {})
    hooks.onBeforeEnter(el)
    expect(el.style.pointerEvents).toBe('')
  })

  it('still finishes instantly under reduced motion', async () => {
    mockReducedMotion(true)
    const hooks = createTransitionHooks('slideUp')
    const el = document.createElement('section')
    const done = vi.fn()
    hooks.onLeave(el, done)
    expect(el.style.pointerEvents).toBe('none')
    await vi.waitFor(() => expect(done).toHaveBeenCalled())
  })
})
