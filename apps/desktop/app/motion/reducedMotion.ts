export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Synchronous read for code that runs outside a component setup (transition hooks). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/** Durations collapse to zero when the user asked for reduced motion. */
export function motionDuration(seconds: number, reduced: boolean = prefersReducedMotion()): number {
  return reduced ? 0 : seconds
}
