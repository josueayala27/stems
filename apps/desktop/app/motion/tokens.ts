// Motion tokens mirror the Panda `durations` / `easings` tokens in panda.config.ts.
// GSAP works in seconds and named eases, CSS in ms and cubic-beziers; tokens.test.ts keeps both in sync.

export const durations = {
  instant: 0.08,
  fast: 0.14,
  normal: 0.22,
  slow: 0.36,
} as const

export type DurationName = keyof typeof durations

export type CubicBezier = readonly [number, number, number, number]

export const easeCurves = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.3, 0, 0, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, CubicBezier>

export type EaseName = keyof typeof easeCurves

/** GSAP ease names registered through CustomEase (see gsap.ts). */
export const eases: Record<EaseName, string> = {
  standard: 'malla.standard',
  emphasized: 'malla.emphasized',
  spring: 'malla.spring',
}

/** SVG path data CustomEase accepts for a CSS cubic-bezier. */
export function cubicBezierToPath([x1, y1, x2, y2]: CubicBezier): string {
  return `M0,0 C${x1},${y1} ${x2},${y2} 1,1`
}

export function cubicBezierToCss([x1, y1, x2, y2]: CubicBezier): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`
}

export function secondsToCss(seconds: number): string {
  return `${Math.round(seconds * 1000)}ms`
}
