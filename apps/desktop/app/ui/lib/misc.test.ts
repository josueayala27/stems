import { describe, expect, it } from 'vitest'
import { ratioFromValue, ratioWithin, valueFromRatio } from './geometry'
import { decimalsOf, formatNumber } from './number'
import { formatShortcut } from './shortcut'
import { resolveTooltipDelay } from './tooltipDelay'

describe('shortcut', () => {
  it('formats per platform', () => {
    expect(formatShortcut('Mod+Shift+k', true)).toEqual(['⌘', '⇧', 'K'])
    expect(formatShortcut('Mod+Shift+k', false)).toEqual(['Ctrl', 'Shift', 'K'])
    expect(formatShortcut('Alt+Backspace', true)).toEqual(['⌥', '⌫'])
    expect(formatShortcut('F2', true)).toEqual(['F2'])
  })
})

describe('geometry', () => {
  it('maps pointer positions to values', () => {
    expect(ratioWithin(50, 0, 200)).toBe(0.25)
    expect(ratioWithin(-10, 0, 200)).toBe(0)
    expect(ratioWithin(10, 0, 0)).toBe(0)
    expect(valueFromRatio(0.26, 0, 100, 5)).toBe(25)
    expect(ratioFromValue(150, 0, 100)).toBe(1)
  })
})

describe('number', () => {
  it('counts decimals and formats', () => {
    expect(decimalsOf(0.1)).toBe(1)
    expect(decimalsOf(5)).toBe(0)
    expect(decimalsOf(1e-7)).toBe(7)
    expect(formatNumber(1.005, 2)).toBe('1')
    expect(formatNumber(-0.001)).toBe('0')
  })
})

describe('tooltip delay', () => {
  it('skips the delay right after another tooltip closed', () => {
    expect(resolveTooltipDelay(1000, null, 400)).toBe(400)
    expect(resolveTooltipDelay(1000, 900, 400)).toBe(0)
    expect(resolveTooltipDelay(1000, 500, 400)).toBe(400)
  })
})
