import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useLayerStack, type Layer } from './uiContext'

export type DismissReason = 'escape' | 'outside'

export interface DismissableLayerOptions {
  open: MaybeRefOrGetter<boolean>
  /** Elements that count as "inside" (surface and anchor). */
  elements: () => ReadonlyArray<Element | null | undefined>
  onDismiss: (reason: DismissReason) => void
}

// Resolved lazily so setup stays SSR-safe; listeners attach only in the browser.
const ownerDocument = () => (typeof document === 'undefined' ? null : document)

export function useDismissableLayer(options: DismissableLayerOptions): { isTop: () => boolean } {
  // Shared stack lets nested popovers close one level at a time.
  const stack = useLayerStack().layers
  const layer: Layer = {
    contains: (target) => options.elements().some((el) => el?.contains(target)),
  }

  function remove(): void {
    const index = stack.indexOf(layer)
    if (index !== -1) stack.splice(index, 1)
  }

  watch(
    () => toValue(options.open),
    (open) => {
      remove()
      if (open) stack.push(layer)
    },
    { immediate: true },
  )

  useEventListener(
    ownerDocument,
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || stack[stack.length - 1] !== layer) return
      event.preventDefault()
      event.stopPropagation()
      options.onDismiss('escape')
    },
    { capture: true },
  )

  useEventListener(
    ownerDocument,
    'pointerdown',
    (event: PointerEvent) => {
      const index = stack.indexOf(layer)
      const target = event.target
      if (index === -1 || !(target instanceof Node)) return
      // A press inside this layer or any layer opened above it keeps it open.
      if (stack.slice(index).some((l) => l.contains(target))) return
      options.onDismiss('outside')
    },
    { capture: true },
  )

  onScopeDispose(remove)
  return { isTop: () => stack[stack.length - 1] === layer }
}
