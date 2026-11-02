import { onScopeDispose, ref, type Ref } from 'vue'

export interface Clipboard {
  /** Writes text; resolves `false` when the clipboard is unavailable or denied. */
  copy: (text: string, id?: string) => Promise<boolean>
  /** Id of the last successful copy (`'default'` without one), cleared after `resetMs`. */
  copied: Ref<string | null>
}

/** Clipboard writes with a short-lived "copied" flag for button feedback. SSR-safe: nothing runs until `copy`. */
export function useClipboard(resetMs = 1500): Clipboard {
  const copied = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(text: string, id = 'default'): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return false
    }
    copied.value = id
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = null), resetMs)
    return true
  }

  onScopeDispose(() => clearTimeout(timer))
  return { copy, copied }
}
