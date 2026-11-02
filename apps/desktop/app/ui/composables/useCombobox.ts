import { computed, ref, watch } from 'vue'
import { edgeIndex } from '../lib/listNavigation'
import type { ComboboxOption } from '../types'
import { useListNavigation } from './useListNavigation'
import { useComboboxSource, type ComboboxSearch } from './useComboboxSource'

export function optionId(listId: string, index: number): string {
  return `${listId}-opt-${index}`
}

export interface ComboboxOptions {
  listId: string
  options: () => readonly ComboboxOption[] | undefined
  search: () => ComboboxSearch | undefined
  debounce: () => number
  creatable: () => boolean
  onPick: (option: ComboboxOption) => void
  onCreate: (query: string) => void
}

/** State and keyboard model shared by Combobox and MultiCombobox (ARIA 1.2 combobox with listbox popup). */
export function useCombobox(options: ComboboxOptions) {
  const open = ref(false)
  const query = ref('')
  const activeIndex = ref(-1)
  const source = useComboboxSource({ query, open, options: options.options, search: options.search, debounce: options.debounce })

  const createQuery = computed(() => {
    const q = query.value.trim()
    if (!options.creatable() || !q || source.loading.value) return null
    const exists = source.results.value.some((o) => o.label.toLowerCase() === q.toLowerCase())
    return exists ? null : q
  })

  const navItems = computed(() => [...source.results.value, ...(createQuery.value === null ? [] : [{ label: createQuery.value }])])

  watch(navItems, (items) => (activeIndex.value = edgeIndex(items, 'first')), { immediate: true })

  function pick(index: number): void {
    const option = source.results.value[index]
    if (option) {
      if (!option.disabled) options.onPick(option)
    } else if (createQuery.value !== null && index === source.results.value.length) {
      options.onCreate(createQuery.value)
    }
  }

  const navigation = useListNavigation({ items: () => navItems.value, activeIndex, onSelect: pick, typeahead: false })

  /** Input keydown: arrows open and move, Enter picks. Space, Home and End stay with the text field. */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return
    if (!open.value) {
      if (event.key !== 'Enter') {
        event.preventDefault()
        open.value = true
      }
      return
    }
    navigation.onKeydown(event)
  }

  const activeDescendant = computed(() => (open.value && activeIndex.value >= 0 ? optionId(options.listId, activeIndex.value) : undefined))

  return { open, query, activeIndex, createQuery, activeDescendant, pick, onKeydown, ...source }
}
