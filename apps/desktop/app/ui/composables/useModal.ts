import { nextTick, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useDismissableLayer, type DismissReason } from './useDismissableLayer'

export interface ModalOptions {
  open: Ref<boolean>
  panel: Readonly<Ref<HTMLElement | null>>
  /** Esc and outside press close the modal. */
  dismissible: MaybeRefOrGetter<boolean>
  onDismiss: (reason: DismissReason) => void
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type=hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable=true]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true')
}

// Resolved lazily so setup stays SSR-safe.
const ownerDocument = () => (typeof document === 'undefined' ? null : document)

/**
 * Modal behaviour shared by Dialog and Sheet: joins the layer stack (Esc / outside
 * press close only the top layer), traps Tab inside the panel while it is the top
 * layer, focuses `[data-autofocus]` or the first focusable outside `[data-part=header]` on open and restores
 * focus to the opener on close.
 */
export function useModal(options: ModalOptions): void {
  const { isTop } = useDismissableLayer({
    open: options.open,
    elements: () => [options.panel.value],
    onDismiss: (reason) => {
      if (toValue(options.dismissible)) options.onDismiss(reason)
    },
  })

  let returnFocusTo: HTMLElement | null = null

  watch(
    options.open,
    async (open) => {
      if (typeof document === 'undefined') return
      if (open) {
        returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
        await nextTick()
        const panel = options.panel.value
        if (!panel) return
        // The header close button is a last resort: start in the content.
        const items = focusableIn(panel)
        const target = panel.querySelector<HTMLElement>('[data-autofocus]') ?? items.find((el) => !el.closest('[data-part=header]')) ?? items[0] ?? panel
        target.focus({ preventScroll: true })
        return
      }
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true })
      returnFocusTo = null
    },
    { immediate: true, flush: 'post' },
  )

  useEventListener(ownerDocument, 'keydown', (event: KeyboardEvent) => {
    const panel = options.panel.value
    if (event.key !== 'Tab' || !options.open.value || !panel || !isTop()) return
    const items = focusableIn(panel)
    if (items.length === 0) {
      event.preventDefault()
      panel.focus({ preventScroll: true })
      return
    }
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement
    const inside = active instanceof Node && panel.contains(active)
    if (!inside) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    } else if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  })
}
