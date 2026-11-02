import { inject, nextTick, provide, ref, shallowReactive, type InjectionKey, type Ref } from 'vue'
import { useFlip } from '../../motion/useFlip'
import { slotToMove, type SortableMove, type SortablePosition } from '../lib/sortable'

export interface SortableListEntry {
  listId: string
  el: () => HTMLElement | null
  count: () => number
  label: () => string
  /** Emits `move` from this (source) list. */
  emitMove: (move: SortableMove) => void
}

export interface SortableDrag {
  from: SortablePosition
  key: string
  label: string
  mode: 'pointer' | 'keyboard'
}

export interface SortableGroup {
  name: string
  lists: Map<string, SortableListEntry>
  drag: Ref<SortableDrag | null>
  /** Slot the item would drop into (see `slotToMove`). */
  target: Ref<SortablePosition | null>
  announcement: Ref<string>
  register: (entry: SortableListEntry) => () => void
  /** Drop slots in reading order, skipping the dragged item's own subtree and its no-op twin slot. */
  slots: () => SortablePosition[]
  /** Slot under a viewport point, or `null` outside every list. */
  slotAt: (x: number, y: number) => SortablePosition | null
  commit: (move: SortableMove, key: string) => Promise<void>
  focusHandle: (key: string) => Promise<void>
}

const KEY: InjectionKey<SortableGroup> = Symbol('SortableGroup')

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
}

function directItems(listEl: HTMLElement): HTMLElement[] {
  return Array.from(listEl.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('data-sortable-item'))
}

function parentList(el: HTMLElement): HTMLElement | null {
  return el.parentElement?.closest<HTMLElement>('[data-sortable-list]') ?? null
}

/**
 * The shared state of every SortableList with the same `group` in one subtree.
 * The outermost list creates it; nested lists of the same group join it, which
 * is what lets items move between levels of a step tree.
 */
export function useSortableGroup(name: string): SortableGroup {
  const existing = inject(KEY, null)
  if (existing && existing.name === name) return existing

  const lists = shallowReactive(new Map<string, SortableListEntry>())
  const drag = ref<SortableDrag | null>(null)
  const target = ref<SortablePosition | null>(null)
  const announcement = ref('')
  const flip = useFlip({ duration: 'fast' })

  function register(entry: SortableListEntry): () => void {
    lists.set(entry.listId, entry)
    return () => {
      if (lists.get(entry.listId) === entry) lists.delete(entry.listId)
    }
  }

  function entryFor(el: HTMLElement): SortableListEntry | undefined {
    const id = el.getAttribute('data-sortable-list')
    return id === null ? undefined : lists.get(id)
  }

  function draggedEl(): HTMLElement | null {
    const current = drag.value
    if (!current) return null
    const listEl = lists.get(current.from.listId)?.el()
    return listEl ? (directItems(listEl)[current.from.index] ?? null) : null
  }

  function slots(): SortablePosition[] {
    const out: SortablePosition[] = []
    const dragged = draggedEl()
    const from = drag.value?.from
    const listEls = [...lists.values()].map((entry) => entry.el()).filter((el): el is HTMLElement => el !== null)
    const roots = listEls.filter((el) => !listEls.some((other) => other !== el && other.contains(el)))
    roots.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))

    function walk(listEl: HTMLElement): void {
      const entry = entryFor(listEl)
      if (!entry || (dragged && dragged.contains(listEl))) return
      const items = directItems(listEl)
      for (let p = 0; p <= items.length; p++) {
        const isTwin = from && from.listId === entry.listId && p === from.index + 1
        if (!isTwin) out.push({ listId: entry.listId, index: p })
        const item = items[p]
        if (!item) continue
        const nested = listEls.filter((el) => item.contains(el) && parentList(el) === listEl)
        nested.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        nested.forEach(walk)
      }
    }

    roots.forEach(walk)
    return out
  }

  function slotAt(x: number, y: number): SortablePosition | null {
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null
    const hit = document.elementFromPoint(x, y)
    let listEl = hit instanceof Element ? hit.closest<HTMLElement>('[data-sortable-list]') : null
    const dragged = draggedEl()
    // Never drop an item into its own children: climb out of the dragged subtree.
    while (listEl && dragged && dragged.contains(listEl)) listEl = parentList(listEl)
    while (listEl && !entryFor(listEl)) listEl = parentList(listEl)
    if (!listEl) return null
    const entry = entryFor(listEl)!
    const items = directItems(listEl)
    const index = items.findIndex((item) => {
      const rect = item.getBoundingClientRect()
      return y < rect.top + rect.height / 2
    })
    return { listId: entry.listId, index: index === -1 ? items.length : index }
  }

  async function focusHandle(key: string): Promise<void> {
    await nextTick()
    const selector = `[data-sortable-key="${cssEscape(key)}"] [data-sortable-handle]`
    for (const entry of lists.values()) {
      const handle = entry.el()?.querySelector<HTMLElement>(selector)
      if (handle) {
        handle.focus()
        return
      }
    }
  }

  async function commit(move: SortableMove, key: string): Promise<void> {
    const source = lists.get(move.from.listId)
    if (!source) return
    const scope = [...lists.values()].map((e) => e.el()).find((el) => el && !parentList(el)) ?? null
    let emitted = false
    const emit = () => {
      emitted = true
      source.emitMove(move)
    }
    try {
      await flip.animate('[data-sortable-item]', emit, { scope })
    } catch {
      // Motion is decoration: a failed capture must not lose the move.
      if (!emitted) emit()
    }
    await focusHandle(key)
  }

  const group: SortableGroup = { name, lists, drag, target, announcement, register, slots, slotAt, commit, focusHandle }
  provide(KEY, group)
  return group
}

export { slotToMove }
