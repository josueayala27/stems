import { clamp } from './number'

/** Position of `client` along a box, normalised to 0..1. */
export function ratioWithin(client: number, start: number, size: number): number {
  if (size <= 0) return 0
  return clamp((client - start) / size, 0, 1)
}

export function valueFromRatio(ratio: number, min: number, max: number, step: number): number {
  const raw = min + ratio * (max - min)
  const snapped = Math.round((raw - min) / step) * step + min
  return clamp(snapped, min, max)
}

export function ratioFromValue(value: number, min: number, max: number): number {
  if (max === min) return 0
  return clamp((value - min) / (max - min), 0, 1)
}
