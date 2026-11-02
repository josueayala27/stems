// Pure parts of SortableList: slot positions and the move they produce.

export interface SortablePosition {
  listId: string
  index: number
}

/** `to.index` is the final index in the destination list after the item left its source. */
export interface SortableMove {
  from: SortablePosition
  to: SortablePosition
}

/**
 * A drop slot is a gap between items: slot `p` of a list with `n` items sits
 * before item `p` (`p === n` is the end). Returns the move for dropping the item
 * at `from` into `slot`, or `null` when it would not change anything.
 */
export function slotToMove(from: SortablePosition, slot: SortablePosition): SortableMove | null {
  if (slot.listId === from.listId) {
    if (slot.index === from.index || slot.index === from.index + 1) return null
    return { from, to: { listId: slot.listId, index: slot.index > from.index ? slot.index - 1 : slot.index } }
  }
  return { from, to: { ...slot } }
}

/**
 * Applies a move to lists keyed by id, returning new arrays for the lists it
 * touched. Callers holding flat lists can use it directly; trees map list ids
 * to their own children arrays.
 */
export function applyMove<T>(lists: Readonly<Record<string, readonly T[]>>, move: SortableMove): Record<string, T[]> {
  const source = [...(lists[move.from.listId] ?? [])]
  const [item] = source.splice(move.from.index, 1)
  if (item === undefined) return {}
  if (move.from.listId === move.to.listId) {
    source.splice(Math.min(move.to.index, source.length), 0, item)
    return { [move.from.listId]: source }
  }
  const target = [...(lists[move.to.listId] ?? [])]
  target.splice(Math.min(move.to.index, target.length), 0, item)
  return { [move.from.listId]: source, [move.to.listId]: target }
}

/** Attributes and listeners for a custom drag handle (SortableList `handleProps`). */
export interface SortableHandleProps {
  'data-sortable-handle': ''
  'aria-label': string
  'aria-describedby': string
  'aria-pressed': boolean
  'aria-keyshortcuts': string
  disabled: boolean
  onPointerdown: (event: PointerEvent) => void
  onKeydown: (event: KeyboardEvent) => void
}
