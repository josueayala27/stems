import { nextTick, onScopeDispose } from 'vue'
import { Flip, gsap } from './gsap'
import { motionDuration } from './reducedMotion'
import { durations, eases, type DurationName, type EaseName } from './tokens'

export type FlipTargets = Element | Element[] | string

export interface FlipOptions {
  duration?: DurationName
  ease?: EaseName
  /** Animate width/height too, not only position. */
  resize?: boolean
  /** Scope for selector-string targets. */
  scope?: Element | null
}

/**
 * Layout animations with GSAP Flip: capture positions, mutate state, animate the
 * difference. `animate` awaits Vue's DOM update between the two.
 */
export function useFlip(defaults: FlipOptions = {}) {
  let running: gsap.core.Timeline | null = null

  function resolve(targets: FlipTargets, scope?: Element | null): Element[] {
    if (typeof targets !== 'string') return Array.isArray(targets) ? targets : [targets]
    return Array.from((scope ?? document).querySelectorAll(targets))
  }

  async function animate(targets: FlipTargets, mutate: () => void | Promise<void>, options: FlipOptions = {}) {
    const opts = { ...defaults, ...options }
    const state = Flip.getState(resolve(targets, opts.scope))
    await mutate()
    await nextTick()
    running?.kill()
    running = Flip.from(state, {
      targets: resolve(targets, opts.scope),
      duration: motionDuration(durations[opts.duration ?? 'normal']),
      ease: eases[opts.ease ?? 'standard'],
      absolute: false,
      scale: !opts.resize,
      simple: true,
    })
  }

  onScopeDispose(() => running?.kill())
  return { animate }
}

export interface TweenOptions {
  duration?: DurationName
  ease?: EaseName
}

/** One-off tween with motion tokens; instant under reduced motion. */
export function tweenTo(target: Element, vars: gsap.TweenVars, options: TweenOptions = {}): gsap.core.Tween {
  return gsap.to(target, {
    ...vars,
    duration: motionDuration(durations[options.duration ?? 'fast']),
    ease: eases[options.ease ?? 'standard'],
    overwrite: 'auto',
  })
}

export function setProps(target: Element, vars: gsap.TweenVars): void {
  gsap.set(target, vars)
}
