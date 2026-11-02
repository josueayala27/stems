import { describe, expect, it } from 'vitest'
import { hexToRgba, hsvaToRgba, parseColor, parseRgbFunction, rgbaToHex, rgbaToHsva, tokenLabel } from './color'

describe('hex', () => {
  it('parses 3, 4, 6 and 8 digit forms', () => {
    expect(hexToRgba('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(hexToRgba('0099ff')).toEqual({ r: 0, g: 153, b: 255, a: 1 })
    expect(hexToRgba('#0008')?.a).toBeCloseTo(0.533, 2)
    expect(hexToRgba('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 0.502 })
    expect(hexToRgba('#ggg')).toBeNull()
    expect(hexToRgba('#12345')).toBeNull()
  })

  it('formats with alpha only when needed', () => {
    expect(rgbaToHex({ r: 0, g: 153, b: 255, a: 1 })).toBe('#0099ff')
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('#ff000080')
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 0.5 }, 'never')).toBe('#ff0000')
    expect(rgbaToHex({ r: 300, g: -4, b: 0, a: 1 })).toBe('#ff0000')
  })
})

describe('rgb()', () => {
  it('accepts comma, space and slash syntaxes', () => {
    expect(parseRgbFunction('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 })
    expect(parseRgbFunction('rgba(10,20,30,0.25)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 })
    expect(parseRgbFunction('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(parseRgbFunction('rgb(100% 0% 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(parseRgbFunction('rgb(1, 2)')).toBeNull()
  })
})

describe('parseColor', () => {
  it('recognises tokens with and without fallback', () => {
    expect(parseColor('var(--brand)')).toEqual({ kind: 'var', name: '--brand', fallback: null })
    expect(parseColor('var(--brand, #fff)')).toEqual({ kind: 'var', name: '--brand', fallback: { r: 255, g: 255, b: 255, a: 1 } })
    expect(tokenLabel('--brand-500')).toBe('brand-500')
  })

  it('handles transparent and garbage', () => {
    expect(parseColor('transparent')).toEqual({ kind: 'rgba', rgba: { r: 0, g: 0, b: 0, a: 0 } })
    expect(parseColor('banana')).toBeNull()
  })
})

describe('named colours and hsl() (QA-STYLES-8)', () => {
  it('parses CSS named colours, case-insensitively', () => {
    expect(parseColor('red')).toEqual({ kind: 'rgba', rgba: { r: 255, g: 0, b: 0, a: 1 } })
    expect(parseColor('RebeccaPurple')).toEqual({ kind: 'rgba', rgba: { r: 102, g: 51, b: 153, a: 1 } })
    expect(parseColor('reddish')).toBeNull()
  })

  it('parses hsl() and hsla() in both syntaxes', () => {
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ kind: 'rgba', rgba: { r: 255, g: 0, b: 0, a: 1 } })
    expect(parseColor('hsl(120deg 100% 25%)')).toEqual({ kind: 'rgba', rgba: { r: 0, g: 128, b: 0, a: 1 } })
    expect(parseColor('hsla(240, 100%, 50%, 0.5)')).toEqual({ kind: 'rgba', rgba: { r: 0, g: 0, b: 255, a: 0.5 } })
    expect(parseColor('hsl(0.5turn 100% 50% / 25%)')).toEqual({ kind: 'rgba', rgba: { r: 0, g: 255, b: 255, a: 0.25 } })
    expect(parseColor('hsl(0, 100%)')).toBeNull()
    expect(parseColor('hsl(a, b, c)')).toBeNull()
  })
})

describe('hsv', () => {
  it('round-trips primaries and greys', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#0099ff', '#808080', '#000000', '#ffffff', '#8b5cf6']) {
      const rgba = hexToRgba(hex)!
      expect(rgbaToHex(hsvaToRgba(rgbaToHsva(rgba)))).toBe(hex)
    }
  })

  it('computes hue, saturation and value', () => {
    expect(rgbaToHsva({ r: 255, g: 0, b: 0, a: 1 })).toEqual({ h: 0, s: 1, v: 1, a: 1 })
    expect(rgbaToHsva({ r: 0, g: 0, b: 255, a: 0.5 })).toEqual({ h: 240, s: 1, v: 1, a: 0.5 })
    expect(hsvaToRgba({ h: 360, s: 1, v: 1, a: 1 })).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })
})
