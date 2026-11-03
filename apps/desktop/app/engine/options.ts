// Click and guide settings: per machine, kept in localStorage and pushed to the engine.
import { reactive, watch } from 'vue'
import type { PerformOptions } from './engine'

const KEY = 'stems.perform.options'

export const DEFAULT_OPTIONS: PerformOptions = {
  click: { enabled: true, sound: 'beep', subdivisions: 1, countInBars: 1, gain: 0.8 },
  guide: { enabled: true, voices: null, gain: 0.8, count: true },
}

/** Saved options merged over the defaults, so new fields get their default. */
export function readOptions(raw: string | null): PerformOptions {
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<PerformOptions>) : {}
    return {
      click: { ...DEFAULT_OPTIONS.click, ...saved.click },
      guide: { ...DEFAULT_OPTIONS.guide, ...saved.guide },
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
    const snapshot = structuredClone({ click: { ...value.click }, guide: { ...value.guide } })
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
