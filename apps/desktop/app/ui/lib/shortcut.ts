const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  cmd: '⌘',
  meta: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
}

const PC_NAMES: Record<string, string> = {
  mod: 'Ctrl',
  cmd: 'Ctrl',
  meta: 'Win',
  ctrl: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
}

const KEY_SYMBOLS: Record<string, string> = {
  enter: '↵',
  return: '↵',
  backspace: '⌫',
  delete: '⌦',
  escape: 'Esc',
  esc: 'Esc',
  tab: '⇥',
  space: 'Space',
  up: '↑',
  arrowup: '↑',
  down: '↓',
  arrowdown: '↓',
  left: '←',
  arrowleft: '←',
  right: '→',
  arrowright: '→',
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return true
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
}

/**
 * Canonical shortcut form: modifiers then key joined by `+`, e.g. `'Mod+Shift+K'`.
 * `Mod` is ⌘ on macOS and Ctrl elsewhere. A literal plus is written `'Mod++'`.
 */
export interface ParsedShortcut {
  mod: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  /** Lower-cased key (`'k'`, `'enter'`, `'arrowup'`, `'+'`). */
  key: string
}

const MODIFIER_ALIASES: Record<string, 'mod' | 'ctrl' | 'alt' | 'shift' | 'meta'> = {
  mod: 'mod',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  space: ' ',
  del: 'delete',
}

function splitShortcut(shortcut: string): string[] {
  const trimmed = shortcut.trim()
  const parts = trimmed.split('+').map((p) => p.trim())
  // `Mod++` splits into ['Mod', '', ''] — restore the literal plus key.
  if (trimmed.endsWith('+')) return [...parts.filter(Boolean), '+']
  return parts.filter(Boolean)
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parsed: ParsedShortcut = { mod: false, ctrl: false, alt: false, shift: false, meta: false, key: '' }
  for (const part of splitShortcut(shortcut)) {
    const lower = part.toLowerCase()
    const modifier = MODIFIER_ALIASES[lower]
    if (modifier) parsed[modifier] = true
    else parsed.key = KEY_ALIASES[lower] ?? lower
  }
  return parsed
}

/** Whether a keyboard event triggers `shortcut` (exact modifiers; `Mod` resolves per platform). */
export function matchesShortcut(event: KeyboardEvent, shortcut: string | ParsedShortcut, mac: boolean = isMacPlatform()): boolean {
  const s = typeof shortcut === 'string' ? parseShortcut(shortcut) : shortcut
  const wantMeta = s.meta || (s.mod && mac)
  const wantCtrl = s.ctrl || (s.mod && !mac)
  if (event.metaKey !== wantMeta || event.ctrlKey !== wantCtrl || event.altKey !== s.alt) return false
  const key = event.key.toLowerCase()
  // Shift changes event.key for symbols ('+' vs '='), so only enforce it for letters and named keys.
  if (key.length !== 1 || /[a-z0-9]/.test(key)) {
    if (event.shiftKey !== s.shift) return false
  }
  // Alt/Option alters event.key on macOS; fall back to the physical key code.
  return key === s.key || event.code.toLowerCase() === `key${s.key}` || event.code.toLowerCase() === `digit${s.key}`
}

/** `'Mod+Shift+K'` → `['⌘', '⇧', 'K']` on macOS, `['Ctrl', 'Shift', 'K']` elsewhere. */
export function formatShortcut(shortcut: string, mac: boolean = isMacPlatform()): string[] {
  return splitShortcut(shortcut).map((part) => {
    const key = part.toLowerCase()
    const modifier = (mac ? MAC_SYMBOLS : PC_NAMES)[key]
    if (modifier) return modifier
    const symbol = KEY_SYMBOLS[key]
    if (symbol) return symbol
    return part.length === 1 ? part.toUpperCase() : part
  })
}
