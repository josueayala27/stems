export interface NavigableItem {
  disabled?: boolean
  label?: string
}

function isEnabled(item: NavigableItem | undefined): boolean {
  return item !== undefined && !item.disabled
}

/** Next enabled index in `direction`, or `current` when nothing else is reachable. */
export function stepIndex(items: readonly NavigableItem[], current: number, direction: 1 | -1, loop = true): number {
  const count = items.length
  if (count === 0) return -1
  let index = current
  for (let i = 0; i < count; i++) {
    index += direction
    if (index < 0 || index >= count) {
      if (!loop) return isEnabled(items[current]) ? current : -1
      index = (index + count) % count
    }
    if (isEnabled(items[index])) return index
  }
  return isEnabled(items[current]) ? current : -1
}

export function edgeIndex(items: readonly NavigableItem[], edge: 'first' | 'last'): number {
  if (edge === 'first') return items.findIndex(isEnabled)
  for (let i = items.length - 1; i >= 0; i--) if (isEnabled(items[i])) return i
  return -1
}

/** First enabled item after `from` whose label starts with `query` (case-insensitive), wrapping. */
export function typeaheadIndex(items: readonly NavigableItem[], query: string, from: number): number {
  const needle = query.toLowerCase()
  if (!needle) return -1
  const count = items.length
  // A repeated single letter cycles through matches, so start after the current item.
  const start = needle.length === 1 ? from + 1 : Math.max(from, 0)
  for (let i = 0; i < count; i++) {
    const index = (start + i) % count
    const item = items[index]
    if (isEnabled(item) && item?.label?.toLowerCase().startsWith(needle)) return index
  }
  return -1
}
