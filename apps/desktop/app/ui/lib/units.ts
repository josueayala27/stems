import { formatNumber } from './number'

export const UNITS = ['px', '%', 'em', 'rem', 'vw', 'vh', 'fr', 'deg', 'auto', ''] as const
/** CSS unit; `''` is a unitless number (opacity, line-height), `auto` carries no number. */
export type Unit = (typeof UNITS)[number]

export interface Dimension {
  value: number | null
  unit: Unit
}

export interface ParseOptions {
  /** Units the field accepts. Typed units outside this list are rejected. */
  units: readonly Unit[]
  /** Unit applied when the text is a bare number. */
  fallbackUnit: Unit
}

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?`
const SINGLE = new RegExp(String.raw`^(${NUMBER})\s*([a-z%]*)$`, 'i')
const BINARY = new RegExp(String.raw`^(${NUMBER})\s*([a-z%]*)\s*([-+*/])\s*(${NUMBER})\s*([a-z%]*)$`, 'i')

function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value)
}

function resolveUnit(raw: string, options: ParseOptions): Unit | null {
  const unit = raw.toLowerCase()
  if (unit === '') return options.fallbackUnit
  return isUnit(unit) && options.units.includes(unit) ? unit : null
}

function applyOperator(a: number, op: string, b: number): number | null {
  const result = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b === 0 ? null : a / b
  return result !== null && Number.isFinite(result) ? result : null
}

/**
 * Parses typed field text: `12`, `12px`, `50 %`, `auto`, and simple math
 * like `10+4` or `100/3%`. Returns `null` for empty or invalid input.
 */
export function parseDimension(text: string, options: ParseOptions): Dimension | null {
  const input = text.trim()
  if (input === '') return null
  if (input.toLowerCase() === 'auto') return options.units.includes('auto') ? { value: null, unit: 'auto' } : null

  const single = SINGLE.exec(input)
  if (single) {
    const unit = resolveUnit(single[2] ?? '', options)
    const value = Number(single[1])
    if (unit === null || unit === 'auto' || !Number.isFinite(value)) return null
    return { value, unit }
  }

  const binary = BINARY.exec(input)
  if (binary) {
    const [, a, unitA = '', op = '+', b, unitB = ''] = binary
    if ((unitA && unitB && unitA.toLowerCase() !== unitB.toLowerCase())) return null
    const unit = resolveUnit(unitA || unitB, options)
    const value = applyOperator(Number(a), op, Number(b))
    if (unit === null || unit === 'auto' || value === null) return null
    return { value, unit }
  }
  return null
}

export function formatDimension(dimension: Dimension, decimals = 2): string {
  if (dimension.unit === 'auto') return 'auto'
  if (dimension.value === null) return ''
  return `${formatNumber(dimension.value, decimals)}${dimension.unit}`
}

/** Reads a stored CSS value (`'12px'`, `'auto'`, `''`) leniently, accepting any known unit. */
export function cssToDimension(css: string, fallbackUnit: Unit = 'px'): Dimension | null {
  return parseDimension(css, { units: UNITS, fallbackUnit })
}
