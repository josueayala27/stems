// Size math for SplitPane. Sizes are percentages of the space the panes share
// (the container minus the separators) and add up to 100. Limits are pixels,
// so resizing works on measured pixel sizes and converts back.

export interface PaneLimits {
  /** Smallest size in px. */
  min?: number
  /** Largest size in px. */
  max?: number
}

const PRECISION = 1000

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION
}

/**
 * Returns `count` sizes that add up to 100. Missing, negative or non-finite
 * entries fall back to an equal share; the result is scaled to 100.
 */
export function normalizeSizes(sizes: readonly number[] | undefined, count: number): number[] {
  if (count <= 0) return []
  const equal = 100 / count
  const list = Array.from({ length: count }, (_, i) => {
    const size = sizes?.[i]
    return size !== undefined && Number.isFinite(size) && size >= 0 ? size : equal
  })
  const total = list.reduce((sum, size) => sum + size, 0)
  if (total <= 0) return list.map(() => round(equal))
  return list.map((size) => round((size / total) * 100))
}

/** Bounds in px for the pane before a separator, given the pair's combined size. */
export function pairBounds(pair: number, before: PaneLimits, after: PaneLimits): { lo: number; hi: number } {
  const lo = Math.max(before.min ?? 0, pair - (after.max ?? Infinity), 0)
  const hi = Math.min(before.max ?? Infinity, pair - (after.min ?? 0), pair)
  // Limits that cannot all hold: keep the pane before the separator at its min.
  return hi < lo ? { lo, hi: lo } : { lo, hi }
}

/**
 * Moves separator `index` (between pane `index` and `index + 1`) so the pane
 * before it measures `target` px, clamped to both panes' limits. `pixels` are the
 * measured pane sizes. Returns new percentage sizes; the other panes keep their
 * measured share.
 */
export function resizePanes(pixels: readonly number[], limits: readonly PaneLimits[], index: number, target: number): number[] {
  const total = pixels.reduce((sum, size) => sum + size, 0)
  if (total <= 0 || index < 0 || index >= pixels.length - 1) return normalizeSizes(pixels, pixels.length)
  const pair = pixels[index]! + pixels[index + 1]!
  const { lo, hi } = pairBounds(pair, limits[index] ?? {}, limits[index + 1] ?? {})
  const before = Math.min(hi, Math.max(lo, target))
  const next = [...pixels]
  next[index] = before
  next[index + 1] = pair - before
  return next.map((size) => round((size / total) * 100))
}
