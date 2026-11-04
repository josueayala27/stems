// Panels the musician can hide and resize, like a DAW's browser: the choice is remembered per
// panel in localStorage. Dragging the edge well below the minimum width hides the panel.
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export interface PanelState {
  width: number
  hidden: boolean
}

/** Saved state merged over the defaults, with the width kept in range. */
export function readPanel(raw: string | null, fallback: PanelState, min: number, max: number): PanelState {
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<PanelState>) : {}
    const width = typeof saved.width === 'number' && Number.isFinite(saved.width) ? saved.width : fallback.width
    return { width: Math.min(max, Math.max(min, width)), hidden: typeof saved.hidden === 'boolean' ? saved.hidden : fallback.hidden }
  } catch {
    return { ...fallback }
  }
}

export function usePanel(key: string, options: { width: number; min: number; max: number; hideBelow?: number }) {
  const storageKey = `stems.panel.${key}`
  const read = () => {
    try {
      return readPanel(window.localStorage.getItem(storageKey), { width: options.width, hidden: false }, options.min, options.max)
    } catch {
      return { width: options.width, hidden: false }
    }
  }
  const initial = typeof window === 'undefined' ? { width: options.width, hidden: false } : read()
  const width = ref(initial.width)
  const hidden = ref(initial.hidden)
  /** Hidden because the window is narrow, not by choice. */
  const squeezed = ref(false)
  const visible: Ref<boolean> = ref(!hidden.value)

  const update = () => {
    visible.value = !hidden.value && !squeezed.value
  }
  watch([width, hidden], () => {
    update()
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ width: width.value, hidden: hidden.value }))
    } catch {
      // Storage unavailable: the panel resets next time.
    }
  })

  let query: MediaQueryList | undefined
  const onQuery = (event: { matches: boolean }) => {
    squeezed.value = event.matches
    update()
  }
  onMounted(() => {
    if (!options.hideBelow) return
    query = window.matchMedia(`(max-width: ${options.hideBelow}px)`)
    onQuery(query)
    query.addEventListener('change', onQuery)
  })
  onBeforeUnmount(() => query?.removeEventListener('change', onQuery))

  return {
    width,
    visible,
    toggle() {
      if (squeezed.value) {
        // On a narrow window, showing it is an explicit choice that lasts until the window changes.
        squeezed.value = false
        hidden.value = false
      } else hidden.value = !hidden.value
      update()
    },
    resize(next: number) {
      if (next < options.min - 60) {
        hidden.value = true
        squeezed.value = false
        update()
        return
      }
      width.value = Math.round(Math.min(options.max, Math.max(options.min, next)))
    },
  }
}
