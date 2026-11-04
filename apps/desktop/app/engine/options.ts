// Click and guide settings: per machine, kept in localStorage and pushed to the engine.
import { reactive, watch } from 'vue'
import type { PerformOptions } from './engine'

const KEY = 'stems.perform.options'

export const DEFAULT_OPTIONS: PerformOptions = {
  click: { enabled: true, sound: 'beep', subdivisions: 1, countInBars: 1, gain: 0.8 },
  guide: { enabled: true, voices: null, gain: 0.8, count: true },
  timecode: { enabled: false, rate: '30', start: '01:00:00:00', hourPerSong: false, gain: 0.25 },
}

/** A plain copy of the options, for the engine. */
export function snapshotOptions(value: PerformOptions): PerformOptions {
  return structuredClone({ click: { ...value.click }, guide: { ...value.guide }, timecode: { ...value.timecode } })
}

/** `HH:MM:SS:FF` (or `;FF` for drop-frame) with fields in range for `rate`. */
export function validTimecode(text: string, rate: PerformOptions['timecode']['rate']): boolean {
  const match = /^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/.exec(text.trim())
  if (!match) return false
  const [hours, minutes, seconds, frames] = match.slice(1).map(Number) as [number, number, number, number]
  const fps = rate === '25' ? 25 : rate === '24' || rate === '23.976' ? 24 : 30
  if (hours > 23 || minutes > 59 || seconds > 59 || frames >= fps) return false
  return !(rate === '29.97df' && seconds === 0 && frames < 2 && minutes % 10 !== 0)
}

/** Song n of a setlist (0-based `index`) at n+1 hours, capped at 23. */
export function songHour(index: number): string {
  return `${String(Math.min(index + 1, 23)).padStart(2, '0')}:00:00:00`
}

/** Saved options merged over the defaults, so new fields get their default. */
export function readOptions(raw: string | null): PerformOptions {
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<PerformOptions>) : {}
    return {
      click: { ...DEFAULT_OPTIONS.click, ...saved.click },
      guide: { ...DEFAULT_OPTIONS.guide, ...saved.guide },
      timecode: { ...DEFAULT_OPTIONS.timecode, ...saved.timecode },
    }
  } catch {
    return structuredClone(DEFAULT_OPTIONS)
  }
}

function load(): PerformOptions {
  try {
    return readOptions(typeof window === 'undefined' ? null : window.localStorage.getItem(KEY))
  } catch {
    return structuredClone(DEFAULT_OPTIONS)
  }
}

const options = reactive<PerformOptions>(load())
let listeners: ((options: PerformOptions) => void)[] = []

watch(
  options,
  (value) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(value))
    } catch {
      // Storage unavailable: settings last for this session only.
    }
    const snapshot = snapshotOptions(value)
    for (const listener of listeners) listener(snapshot)
  },
  { deep: true },
)

export function usePerformOptions(): PerformOptions {
  return options
}

/** Called with a copy of the options after every change. Returns a stop function. */
export function onOptionsChange(listener: (options: PerformOptions) => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((other) => other !== listener)
  }
}
