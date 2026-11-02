// Pure helpers behind DataTable: sorting, range selection and row virtualization.

export type SortDirection = 'asc' | 'desc'

export interface TableSort {
  key: string
  direction: SortDirection
}

/** Header click cycle: unsorted → asc → desc → unsorted. */
export function nextSort(current: TableSort | null, key: string): TableSort | null {
  if (!current || current.key !== key) return { key, direction: 'asc' }
  return current.direction === 'asc' ? { key, direction: 'desc' } : null
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined || a === '') return 1
  if (b === null || b === undefined || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'boolean' && typeof b === 'boolean') return a ? -1 : 1
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/** Stable sort by `value(row)`; empty values stay last in both directions. */
export function sortRows<Row>(rows: readonly Row[], value: (row: Row) => unknown, direction: SortDirection): Row[] {
  const sign = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((x, y) => {
      const xEmpty = x.v === null || x.v === undefined || x.v === ''
      const yEmpty = y.v === null || y.v === undefined || y.v === ''
      if (xEmpty !== yEmpty) return xEmpty ? 1 : -1
      return compareValues(x.v, y.v) * sign || x.index - y.index
    })
    .map((x) => x.row)
}

/**
 * Checkbox click on `target`. With `shift` and an anchor, every row between the
 * anchor and the target takes the target's new state; otherwise only the target toggles.
 */
export function selectRange(
  keys: readonly string[],
  selected: readonly string[],
  target: string,
  anchor: string | null,
  shift: boolean,
): string[] {
  const set = new Set(selected)
  const select = !set.has(target)
  const from = anchor === null ? -1 : keys.indexOf(anchor)
  const to = keys.indexOf(target)
  if (shift && from !== -1 && to !== -1) {
    const [start, end] = from < to ? [from, to] : [to, from]
    for (const key of keys.slice(start, end + 1)) {
      if (select) set.add(key)
      else set.delete(key)
    }
  } else if (select) set.add(target)
  else set.delete(target)
  // Keep table order so the emitted array is stable.
  return keys.filter((key) => set.has(key)).concat(selected.filter((key) => !keys.includes(key) && set.has(key)))
}

export interface VirtualWindow {
  start: number
  end: number
  padTop: number
  padBottom: number
}

/** Rows to render for a fixed row height; `end` is exclusive. */
export function virtualWindow(scrollTop: number, viewport: number, rowHeight: number, count: number, overscan = 8): VirtualWindow {
  if (count === 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visible = Math.ceil(Math.max(viewport, rowHeight) / rowHeight)
  const start = Math.max(0, Math.min(count - 1, first - overscan))
  const end = Math.min(count, first + visible + overscan)
  return { start, end, padTop: start * rowHeight, padBottom: (count - end) * rowHeight }
}
