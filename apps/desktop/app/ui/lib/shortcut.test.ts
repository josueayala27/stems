import { describe, expect, it } from 'vitest'
import { formatShortcut, matchesShortcut, parseShortcut } from './shortcut'

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('parseShortcut', () => {
  it('parses the canonical Mod+Shift+K form', () => {
    expect(parseShortcut('Mod+Shift+K')).toEqual({ mod: true, ctrl: false, alt: false, shift: true, meta: false, key: 'k' })
    expect(parseShortcut('Alt+Esc').key).toBe('escape')
    expect(parseShortcut('Mod++')).toMatchObject({ mod: true, key: '+' })
  })
})

describe('matchesShortcut', () => {
  it('resolves Mod per platform with exact modifiers', () => {
    expect(matchesShortcut(key({ key: 'k', metaKey: true, shiftKey: true }), 'Mod+Shift+K', true)).toBe(true)
    expect(matchesShortcut(key({ key: 'k', ctrlKey: true, shiftKey: true }), 'Mod+Shift+K', false)).toBe(true)
    expect(matchesShortcut(key({ key: 'k', metaKey: true }), 'Mod+Shift+K', true)).toBe(false)
    expect(matchesShortcut(key({ key: 'k', ctrlKey: true, shiftKey: true }), 'Mod+Shift+K', true)).toBe(false)
  })

  it('handles named keys, symbols and Option-altered keys', () => {
    expect(matchesShortcut(key({ key: 'Backspace' }), 'Backspace', true)).toBe(true)
    expect(matchesShortcut(key({ key: '+', metaKey: true, shiftKey: true }), 'Mod++', true)).toBe(true)
    expect(matchesShortcut(key({ key: '©', code: 'KeyG', metaKey: true, altKey: true }), 'Mod+Alt+G', true)).toBe(true)
  })
})

describe('formatShortcut', () => {
  it('formats a literal plus', () => {
    expect(formatShortcut('Mod++', true)).toEqual(['⌘', '+'])
  })
})
