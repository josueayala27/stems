import { clamp, decimalsOf, roundTo } from './number'

export interface ScrubModifiers {
  shift: boolean
  alt: boolean
}

export interface ScrubConfig {
  step: number
  /** Pointer distance that moves the value by one step. */
  pixelsPerStep: number
  min?: number
  max?: number
}

export interface ScrubState {
  value: number
  /** Sub-step pointer travel carried into the next move. */
  remainder: number
}

/** Shift moves ×10, Alt ×0.1. */
export function scrubMultiplier(modifiers: ScrubModifiers): number {
  if (modifiers.shift) return 10
  if (modifiers.alt) return 0.1
  return 1
}

/**
 * Applies one pointer movement. Accumulates incrementally so the modifier can
 * change mid-drag without the value jumping.
 */
export function accumulateScrub(state: ScrubState, dx: number, modifiers: ScrubModifiers, config: ScrubConfig): ScrubState {
  const travel = state.remainder + dx
  const steps = Math.trunc(travel / config.pixelsPerStep)
  const remainder = travel - steps * config.pixelsPerStep
  if (steps === 0) return { value: state.value, remainder }
  const quantum = config.step * scrubMultiplier(modifiers)
  const decimals = Math.max(decimalsOf(config.step), decimalsOf(quantum))
  const value = roundTo(clamp(state.value + steps * quantum, config.min, config.max), decimals)
  return { value, remainder }
}

/** Keyboard nudge: arrows ±step, Shift ±10 steps, Alt ±0.1 step. */
export function nudge(value: number, direction: 1 | -1, modifiers: ScrubModifiers, config: Omit<ScrubConfig, 'pixelsPerStep'>): number {
  const quantum = config.step * scrubMultiplier(modifiers)
  const decimals = Math.max(decimalsOf(config.step), decimalsOf(quantum))
  return roundTo(clamp(value + direction * quantum, config.min, config.max), decimals)
}
