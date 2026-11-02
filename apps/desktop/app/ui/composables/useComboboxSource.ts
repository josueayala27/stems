import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { ComboboxOption } from '../types'

export type ComboboxSearch = (query: string) => Promise<readonly ComboboxOption[]>

export interface ComboboxSourceOptions {
  query: Readonly<Ref<string>>
  open: Readonly<Ref<boolean>>
  /** Static options, filtered by label on the client. */
  options: () => readonly ComboboxOption[] | undefined
  /** Async source; wins over `options`. Called with the trimmed query (also `''` on open). */
  search: () => ComboboxSearch | undefined
  debounce: () => number
}

export function filterOptions(options: readonly ComboboxOption[], query: string): ComboboxOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...options]
  return options.filter((o) => o.label.toLowerCase().includes(needle) || o.description?.toLowerCase().includes(needle))
}

/**
 * Option results for a combobox query. Async searches are debounced and only
 * the latest response is kept. Every option seen is remembered so selected
 * values keep their labels after the results change.
 */
export function useComboboxSource(options: ComboboxSourceOptions) {
  const results = shallowRef<ComboboxOption[]>([])
  const loading = ref(false)
  const error = shallowRef<unknown>(null)
  const known = new Map<string, ComboboxOption>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let request = 0

  function remember(list: readonly ComboboxOption[]): void {
    for (const option of list) known.set(option.value, option)
  }

  function run(): void {
    clearTimeout(timer)
    const search = options.search()
    if (!search) {
      const all = options.options() ?? []
      remember(all)
      results.value = filterOptions(all, options.query.value)
      return
    }
    if (!options.open.value) return
    const id = ++request
    loading.value = true
    timer = setTimeout(
      () => {
        search(options.query.value.trim()).then(
          (list) => {
            if (id !== request) return
            remember(list)
            results.value = [...list]
            error.value = null
            loading.value = false
          },
          (reason: unknown) => {
            if (id !== request) return
            error.value = reason
            results.value = []
            loading.value = false
          },
        )
      },
      options.query.value ? options.debounce() : 0,
    )
  }

  watch([options.query, options.open, options.options], run, { immediate: true })
  onScopeDispose(() => {
    clearTimeout(timer)
    request++
  })

  return {
    results,
    loading,
    error,
    /** A known option for `value`, from static options or any earlier search result. */
    lookup: (value: string): ComboboxOption | undefined => known.get(value),
    remember,
  }
}
