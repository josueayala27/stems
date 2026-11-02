import { onMounted, onUpdated, shallowRef } from 'vue'

/**
 * First element with a layout box under `root`. `display: contents` wrappers (our own slot
 * wrappers, e.g. the Tooltip around an IconButton) have an empty bounding rect, so anchoring to
 * one puts the surface at the viewport's top-left corner (QA-UI-1): descend through them.
 */
export function firstBoxElement(root: Element | null | undefined): HTMLElement | null {
  let el = root?.firstElementChild ?? null
  while (el instanceof HTMLElement && typeof getComputedStyle === 'function' && getComputedStyle(el).display === 'contents') {
    const child: Element | null = el.firstElementChild
    if (!child) break
    el = child
  }
  return el instanceof HTMLElement ? el : null
}

/**
 * Resolves the first element rendered by a slot inside a `display: contents` wrapper, so a
 * consumer's own button can act as the anchor without an extra box.
 */
export function useSlotAnchor() {
  const wrapper = shallowRef<HTMLElement | null>(null)
  const anchor = shallowRef<HTMLElement | null>(null)

  function sync(): void {
    const next = firstBoxElement(wrapper.value)
    if (next !== anchor.value) anchor.value = next
  }

  onMounted(sync)
  onUpdated(sync)
  return { wrapper, anchor }
}
