import { NAMED_COLORS } from './namedColors'
import { clamp, roundTo } from './number'

/** Channels 0..255, alpha 0..1. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Hue 0..360, saturation/value/alpha 0..1. */
export interface Hsva {
  h: number
  s: number
  v: number
  a: number
}

export type ParsedColor =
  | { kind: 'rgba'; rgba: Rgba }
  /** A design-token reference such as `var(--brand)`. */
  | { kind: 'var'; name: string; fallback: Rgba | null }

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB_FN = /^rgba?\(\s*([^)]*)\)$/i
const HSL_FN = /^hsla?\(\s*([^)]*)\)$/i
const VAR_FN = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/i

export function hexToRgba(input: string): Rgba | null {
  const match = HEX.exec(input.trim())
  if (!match?.[1]) return null
  let hex = match[1]
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? roundTo(n(6) / 255, 3) : 1 }
}

function toHexByte(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
}

/** `#rrggbb`, or `#rrggbbaa` when not fully opaque (or `alpha: 'always'`). */
export function rgbaToHex(rgba: Rgba, alpha: 'auto' | 'always' | 'never' = 'auto'): string {
  const base = `#${toHexByte(rgba.r)}${toHexByte(rgba.g)}${toHexByte(rgba.b)}`
  const withAlpha = alpha === 'always' || (alpha === 'auto' && rgba.a < 1)
  return withAlpha ? base + toHexByte(rgba.a * 255) : base
}

function parseChannel(raw: string, max: number): number | null {
  const text = raw.trim()
  if (text === '') return null
  const value = text.endsWith('%') ? (parseFloat(text) / 100) * max : parseFloat(text)
  return Number.isFinite(value) ? clamp(value, 0, max) : null
}

/** `rgb(1 2 3)`, `rgb(1, 2, 3)`, `rgba(1, 2, 3, .5)`, `rgb(1 2 3 / 50%)`. */
export function parseRgbFunction(input: string): Rgba | null {
  const body = RGB_FN.exec(input.trim())?.[1]
  if (body === undefined) return null
  const [channelsPart = '', slashAlpha] = body.split('/')
  const parts = channelsPart.split(/[\s,]+/).filter(Boolean)
  const alphaRaw = slashAlpha ?? parts[3]
  if (parts.length < 3 || parts.length > 4 || (slashAlpha !== undefined && parts.length !== 3)) return null
  const [r, g, b] = parts.slice(0, 3).map((p) => parseChannel(p, 255))
  const a = alphaRaw === undefined ? 1 : parseChannel(alphaRaw, 1)
  if (r == null || g == null || b == null || a == null) return null
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: roundTo(a, 3) }
}

/** Hue in degrees from `120`, `120deg`, `0.5turn`, `3.14rad`, `200grad`. */
function parseHue(raw: string): number | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(deg|turn|rad|grad)?$/i.exec(raw.trim())
  if (!match) return null
  const value = parseFloat(match[1] as string)
  const unit = match[2]?.toLowerCase()
  const deg = unit === 'turn' ? value * 360 : unit === 'rad' ? (value * 180) / Math.PI : unit === 'grad' ? value * 0.9 : value
  return ((deg % 360) + 360) % 360
}

/** `hsl(120 100% 25%)`, `hsl(0, 100%, 50%)`, `hsla(240, 100%, 50%, .5)`, `hsl(0.5turn 100% 50% / 25%)`. */
export function parseHslFunction(input: string): Rgba | null {
  const body = HSL_FN.exec(input.trim())?.[1]
  if (body === undefined) return null
  const [channelsPart = '', slashAlpha] = body.split('/')
  const parts = channelsPart.split(/[\s,]+/).filter(Boolean)
  const alphaRaw = slashAlpha ?? parts[3]
  if (parts.length < 3 || parts.length > 4 || (slashAlpha !== undefined && parts.length !== 3)) return null
  const h = parseHue(parts[0] as string)
  const percent = (raw: string) => (/^-?(?:\d+\.?\d*|\.\d+)%?$/.test(raw) ? clamp(parseFloat(raw), 0, 100) / 100 : null)
  const s = percent(parts[1] as string)
  const l = percent(parts[2] as string)
  const a = alphaRaw === undefined ? 1 : parseChannel(alphaRaw, 1)
  if (h == null || s == null || l == null || a == null) return null
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a: roundTo(a, 3) }
}

export function parseColor(input: string): ParsedColor | null {
  const text = input.trim()
  if (text.toLowerCase() === 'transparent') return { kind: 'rgba', rgba: { r: 0, g: 0, b: 0, a: 0 } }
  const variable = VAR_FN.exec(text)
  if (variable?.[1]) {
    const fallback = variable[2] ? parseColor(variable[2]) : null
    return { kind: 'var', name: variable[1], fallback: fallback?.kind === 'rgba' ? fallback.rgba : null }
  }
  const named = NAMED_COLORS.get(text.toLowerCase())
  if (named) return { kind: 'rgba', rgba: hexToRgba(named) as Rgba }
  if (/^hsla?\(/i.test(text)) {
    const hsl = parseHslFunction(text)
    return hsl ? { kind: 'rgba', rgba: hsl } : null
  }
  const rgba = text.startsWith('#') || HEX.test(text) ? hexToRgba(text) : parseRgbFunction(text)
  return rgba ? { kind: 'rgba', rgba } : null
}

export function rgbaToHsva({ r, g, b, a }: Rgba): Hsva {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const delta = max - Math.min(rn, gn, bn)
  let h = 0
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max, a }
}

export function hsvaToRgba({ h, s, v, a }: Hsva): Rgba {
  const hue = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a }
}

export function hsvaToHex(hsva: Hsva, alpha: 'auto' | 'always' | 'never' = 'auto'): string {
  return rgbaToHex(hsvaToRgba(hsva), alpha)
}

/** CSS value for a solid colour: hex6 when opaque, hex8 otherwise. */
export function rgbaToCss(rgba: Rgba): string {
  return rgbaToHex(rgba)
}

export function rgbaEqual(a: Rgba, b: Rgba): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.002
}

/** Token name without the leading dashes: `var(--brand-500)` → `brand-500`. */
export function tokenLabel(name: string): string {
  return name.replace(/^--/, '')
}
