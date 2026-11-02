export function clamp(value: number, min = -Infinity, max = Infinity): number {
  return Math.min(max, Math.max(min, value))
}

/** Decimal places in a step, so `0.1` → 1 and `5` → 0. */
export function decimalsOf(step: number): number {
  if (!Number.isFinite(step)) return 0
  const text = String(step)
  if (text.includes('e-')) return Number(text.split('e-')[1])
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Formats without trailing zeros or `-0`. */
export function formatNumber(value: number, decimals = 2): string {
  const rounded = roundTo(value, decimals)
  return String(Object.is(rounded, -0) ? 0 : rounded)
}
