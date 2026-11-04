import type { ControlAction, ControlBinding, ControlTrigger } from '@stems/schema'

/**
 * Footswitches and controllers. A control fires on a press: note on with velocity above 0, a CC
 * at 64 or more (footswitches send 127 down and 0 up), or a program change. Releases and other
 * messages do nothing.
 */

export interface MidiPress {
  kind: ControlTrigger['kind']
  /** 1–16. */
  channel: number
  number: number
}

/** The press in a raw MIDI message, or null for releases and other messages. */
export function parsePress(bytes: readonly number[]): MidiPress | null {
  const [status = 0, data1 = 0, data2 = 0] = bytes
  const type = status & 0xf0
  const channel = (status & 0x0f) + 1
  if (type === 0x90 && data2 > 0) return { kind: 'note', channel, number: data1 }
  if (type === 0xb0 && data2 >= 64) return { kind: 'cc', channel, number: data1 }
  if (type === 0xc0) return { kind: 'program', channel, number: data1 }
  return null
}

/** A trigger that matches this press on its channel (learn mode). */
export function triggerFor(press: MidiPress): ControlTrigger {
  return { kind: press.kind, channel: press.channel, number: press.number }
}

export function matches(trigger: ControlTrigger, press: MidiPress): boolean {
  return trigger.kind === press.kind && trigger.number === press.number && (trigger.channel === null || trigger.channel === press.channel)
}

/** The action bound to `press`, the first binding that matches. */
export function actionFor(bindings: readonly ControlBinding[], press: MidiPress): ControlAction | null {
  return bindings.find((binding) => matches(binding.trigger, press))?.action ?? null
}

/** Bind `action` to `trigger`. The trigger leaves any other action it was on: one switch, one job. */
export function bind(bindings: readonly ControlBinding[], action: ControlAction, trigger: ControlTrigger): ControlBinding[] {
  const same = (other: ControlTrigger) => other.kind === trigger.kind && other.number === trigger.number && other.channel === trigger.channel
  return [...bindings.filter((binding) => binding.action !== action && !same(binding.trigger)), { action, trigger }]
}

export function unbind(bindings: readonly ControlBinding[], action: ControlAction): ControlBinding[] {
  return bindings.filter((binding) => binding.action !== action)
}

/** `CC 64 · ch 1`, `Note C3 · any ch`, `Program 5 · ch 2` (programs shown 1–128). */
export function triggerLabel(trigger: ControlTrigger): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  const what =
    trigger.kind === 'cc'
      ? `CC ${trigger.number}`
      : trigger.kind === 'program'
        ? `Program ${trigger.number + 1}`
        : `Note ${names[trigger.number % 12]}${Math.floor(trigger.number / 12) - 2}`
  return `${what} · ${trigger.channel === null ? 'any ch' : `ch ${trigger.channel}`}`
}

export const CONTROL_ACTIONS: { action: ControlAction; label: string }[] = [
  { action: 'playPause', label: 'Play / pause' },
  { action: 'stop', label: 'Stop' },
  { action: 'vamp', label: 'Vamp on / off' },
  { action: 'nextSection', label: 'Next section' },
  { action: 'previousSection', label: 'Previous section' },
  { action: 'skipSection', label: 'Skip next section' },
  { action: 'stopAtSectionEnd', label: 'Stop at section end' },
  { action: 'nextSong', label: 'Next song' },
  { action: 'cancel', label: 'Cancel armed action' },
]
