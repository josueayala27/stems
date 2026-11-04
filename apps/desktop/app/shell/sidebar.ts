// The workspace sidebar: collapsed to icons or open, and its open width. Shared by the layout,
// the toolbar toggle and the ⌘B shortcut. Remembered in localStorage.
import { ref } from 'vue'

const COLLAPSED = 'stems.sidebar.collapsed'
const WIDTH = 'stems.sidebar.width'
export const SIDEBAR_WIDTH = 260
export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 360
/** The icon rail's width. */
export const SIDEBAR_RAIL = 52
/** Dragging the edge this far below the minimum snaps the sidebar to the icon rail. */
const SNAP = 50

function load(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function save(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the choice lasts this session.
  }
}

const savedWidth = Number(load(WIDTH))
const collapsed = ref(load(COLLAPSED) === 'true')
const width = ref(Number.isFinite(savedWidth) && savedWidth >= SIDEBAR_MIN ? Math.min(SIDEBAR_MAX, savedWidth) : SIDEBAR_WIDTH)

export function useSidebar() {
  return {
    collapsed,
    width,
    toggle() {
      collapsed.value = !collapsed.value
      save(COLLAPSED, String(collapsed.value))
    },
    /** Drag the edge: narrower than the minimum snaps to icons, wider than the rail opens it again. */
    resize(next: number) {
      const rail = next < SIDEBAR_MIN - SNAP
      if (rail !== collapsed.value) {
        collapsed.value = rail
        save(COLLAPSED, String(rail))
      }
      if (rail) return
      width.value = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, next)))
      save(WIDTH, String(width.value))
    },
  }
}
