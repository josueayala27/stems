import { onScopeDispose, type Ref } from 'vue'
import { edgeIndex, stepIndex, typeaheadIndex, type NavigableItem } from '../lib/listNavigation'

export interface ListNavigationOptions {
  items: () => readonly NavigableItem[]
  activeIndex: Ref<number>
  onSelect: (index: number) => void
  orientation?: 'vertical' | 'horizontal'
  loop?: boolean
  typeahead?: boolean
}

const TYPEAHEAD_RESET_MS = 500

/**
 * Keyboard model for listbox-like widgets using aria-activedescendant:
 * arrows, Home/End, Enter/Space and typeahead. Returns `true` when handled.
 */
export function useListNavigation(options: ListNavigationOptions) {
  let buffer = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  const next = options.orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  const prev = options.orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'

  function move(index: number): void {
    if (index !== -1) options.activeIndex.value = index
  }

  function onKeydown(event: KeyboardEvent): boolean {
    const items = options.items()
    const loop = options.loop ?? true
    switch (event.key) {
      case next:
        move(stepIndex(items, options.activeIndex.value, 1, loop))
        break
      case prev:
        move(options.activeIndex.value === -1 ? edgeIndex(items, 'last') : stepIndex(items, options.activeIndex.value, -1, loop))
        break
      case 'Home':
        move(edgeIndex(items, 'first'))
        break
      case 'End':
        move(edgeIndex(items, 'last'))
        break
      case 'Enter':
      case ' ':
        if (event.key === ' ' && buffer) return typeahead(event)
        if (options.activeIndex.value !== -1) options.onSelect(options.activeIndex.value)
        break
      default:
        return typeahead(event)
    }
    event.preventDefault()
    return true
  }

  function typeahead(event: KeyboardEvent): boolean {
    if (options.typeahead === false || event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return false
    clearTimeout(timer)
    buffer += event.key
    timer = setTimeout(() => (buffer = ''), TYPEAHEAD_RESET_MS)
    move(typeaheadIndex(options.items(), buffer, options.activeIndex.value))
    event.preventDefault()
    return true
  }

  onScopeDispose(() => clearTimeout(timer))
  return { onKeydown }
}
