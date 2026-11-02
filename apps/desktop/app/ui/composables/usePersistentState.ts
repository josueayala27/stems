import { ref, watch, type Ref } from 'vue'

const PREFIX = 'malla.ui.'

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode, quota); the state just won't persist.
  }
}

/** A ref mirrored to localStorage when `key` is set; plain in-memory state otherwise. */
export function usePersistentState<T extends boolean | number | string>(key: string | undefined, fallback: T): Ref<T> {
  const state = ref(key ? read(key, fallback) : fallback) as Ref<T>
  if (key) watch(state, (value) => write(key, value))
  return state
}
