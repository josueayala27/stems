import { gsap } from './gsap'
import { prefersReducedMotion } from './reducedMotion'
import { durations, eases, type DurationName, type EaseName } from './tokens'

export interface QuickToOptions {
  /** Token name or seconds. */
  duration?: DurationName | number
  ease?: EaseName
  /** Unit appended by GSAP, e.g. `'px'`. */
  unit?: string
}

export interface QuickSetter {
  /** Retargets the running tween (or sets instantly under reduced motion). */
  set: (value: number) => void
  dispose: () => void
}

/**
 * Reduced-motion-aware `gsap.quickTo` for high-frequency updates (cursors,
 * follow effects). Reduced motion is read once, when the setter is created.
 */
export function quickTo(target: Element, prop: string, options: QuickToOptions = {}): QuickSetter {
  const unit = options.unit
  if (prefersReducedMotion()) {
    return {
      set: (value) => gsap.set(target, { [prop]: unit ? `${value}${unit}` : value }),
      dispose: () => gsap.killTweensOf(target, prop),
    }
  }
  const duration = typeof options.duration === 'number' ? options.duration : durations[options.duration ?? 'fast']
  const setter = gsap.quickTo(target, prop, { duration, ease: eases[options.ease ?? 'standard'], ...(unit ? { unit } : {}) })
  return {
    set: (value) => {
      setter(value)
    },
    dispose: () => gsap.killTweensOf(target, prop),
  }
}
