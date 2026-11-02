<script setup lang="ts">
import { Icon } from '#components'
import { cva } from 'styled-system/css'
import { computed, ref, useId, watch } from 'vue'
import ComboboxList from './ComboboxList.vue'
import Popover from './Popover.vue'
import { useCombobox } from './composables/useCombobox'
import type { ComboboxSearch } from './composables/useComboboxSource'
import type { ComboboxOption, ControlSize } from './types'

// Fragment root (field + teleported list): attrs go to the field shell.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** Static options, filtered by label as the user types. */
    options?: readonly ComboboxOption[]
    /** Async option source; called with the query (debounced), and with `''` when the list opens. */
    search?: ComboboxSearch
    /** Debounce for `search` in ms. */
    debounce?: number
    /** Label for a value that is not in the loaded options (e.g. an id loaded from the server). */
    labelFor?: (value: string) => string | undefined
    /** Shows a "Create “query”" row when no option matches the query exactly; picking it emits `create`. */
    creatable?: boolean
    clearable?: boolean
    /** Upper bound on selected values; the list closes once reached. */
    max?: number
    placeholder?: string
    emptyText?: string
    size?: ControlSize
    disabled?: boolean
    invalid?: boolean
    ariaLabel?: string
  }>(),
  {
    options: undefined,
    search: undefined,
    debounce: 200,
    labelFor: undefined,
    creatable: false,
    clearable: false,
    max: undefined,
    placeholder: 'Search…',
    emptyText: 'No matches',
    size: 'md',
    disabled: false,
    invalid: false,
    ariaLabel: undefined,
  },
)

const model = defineModel<string[]>({ default: () => [] })

const emit = defineEmits<{
  /** The user picked the create row; the parent creates the option and sets the model. */
  create: [query: string]
}>()

defineSlots<{
  option?: (scope: { option: ComboboxOption; selected: boolean; active: boolean }) => unknown
  create?: (scope: { query: string }) => unknown
  empty?: () => unknown
}>()

const listId = `${useId()}-list`
const shell = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const popover = ref<InstanceType<typeof Popover> | null>(null)

const combobox = useCombobox({
  listId,
  options: () => props.options,
  search: () => props.search,
  debounce: () => props.debounce,
  creatable: () => props.creatable,
  onPick: (option) => toggle(option.value),
  onCreate: (query) => {
    emit('create', query)
    combobox.query.value = ''
  },
})
const { open, query, activeIndex, results, loading, createQuery, activeDescendant, lookup } = combobox

function labelOf(value: string): string {
  return lookup(value)?.label ?? props.labelFor?.(value) ?? value
}

const selectedSet = computed(() => new Set(model.value))
const full = computed(() => props.max !== undefined && model.value.length >= props.max)

watch(open, (value) => {
  if (!value) query.value = ''
})

function toggle(value: string): void {
  if (selectedSet.value.has(value)) {
    model.value = model.value.filter((v) => v !== value)
  } else if (!full.value) {
    model.value = [...model.value, value]
    if (props.max !== undefined && model.value.length >= props.max) open.value = false
  }
  query.value = ''
}

function remove(value: string): void {
  model.value = model.value.filter((v) => v !== value)
  input.value?.focus()
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Backspace' && query.value === '' && model.value.length > 0) {
    model.value = model.value.slice(0, -1)
    return
  }
  combobox.onKeydown(event)
}

function onInput(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  query.value = event.target.value
  open.value = true
}

function onFocusout(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && (shell.value?.contains(next) || popover.value?.surface?.contains(next))) return
  open.value = false
}

function clear(): void {
  model.value = []
  input.value?.focus()
}

const shellRecipe = cva({
  base: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '1',
    w: 'full',
    minW: '0',
    px: '1',
    py: '[3px]',
    borderRadius: 'sm',
    bg: 'bg.input',
    color: 'fg.default',
    borderWidth: '1px',
    borderColor: 'transparent',
    cursor: 'text',
    transitionProperty: 'border-color',
    transitionDuration: 'fast',
    _hover: { borderColor: 'border.default' },
    _focusWithin: { borderColor: 'accent.default', _hover: { borderColor: 'accent.default' } },
    '& input': {
      flex: '1',
      minW: '[64px]',
      h: '[20px]',
      px: '1',
      bg: 'transparent',
      color: 'inherit',
      outline: 'none',
      _placeholder: { color: 'fg.subtle' },
    },
    '& [data-part=chip]': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5',
      maxW: 'full',
      h: '[20px]',
      pl: '1.5',
      pr: '0.5',
      borderRadius: 'xs',
      bg: 'bg.active',
      textStyle: 'ui.xs',
      color: 'fg.default',
    },
    '& [data-part=chip-label]': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    '& [data-part=chip] button': { display: 'inline-grid', placeItems: 'center', w: '4', h: '4', borderRadius: 'xs', color: 'fg.muted', cursor: 'pointer', _hover: { bg: 'bg.hover', color: 'fg.default' } },
    '& [data-part=adornment]': { display: 'inline-grid', placeItems: 'center', color: 'fg.subtle', flexShrink: 0, borderRadius: 'xs' },
    '& button[data-part=adornment]': { cursor: 'pointer', _hover: { color: 'fg.default' } },
  },
  variants: {
    size: {
      sm: { minH: 'control.sm', textStyle: 'ui.xs' },
      md: { minH: 'control.md', textStyle: 'ui.sm' },
    },
    invalid: { true: { borderColor: 'danger.default', _hover: { borderColor: 'danger.default' } } },
    disabled: { true: { opacity: 0.4, pointerEvents: 'none' } },
  },
})

defineExpose({ focus: () => input.value?.focus(), input })
</script>

<template>
  <div v-bind="$attrs" ref="shell" :class="shellRecipe({ size, invalid, disabled })" @focusout="onFocusout" @click="input?.focus()">
    <span v-for="value in model" :key="value" data-part="chip">
      <span data-part="chip-label">{{ labelOf(value) }}</span>
      <button v-if="!disabled" type="button" :aria-label="`Remove ${labelOf(value)}`" tabindex="-1" @click.stop="remove(value)">
        <Icon name="lucide:x" :size="10" aria-hidden="true" />
      </button>
    </span>
    <input
      ref="input"
      type="text"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      :aria-activedescendant="activeDescendant"
      :aria-label="ariaLabel"
      :aria-invalid="invalid || undefined"
      :value="query"
      :placeholder="model.length ? undefined : placeholder"
      :disabled="disabled"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
      @click="open = true"
      @keydown="onInputKeydown"
    />
    <button v-if="clearable && model.length > 0 && !disabled" type="button" data-part="adornment" aria-label="Clear all" tabindex="-1" @click.stop="clear">
      <Icon name="lucide:x" :size="12" aria-hidden="true" />
    </button>
    <span data-part="adornment" aria-hidden="true"><Icon name="lucide:chevrons-up-down" :size="12" /></span>
  </div>
  <Popover ref="popover" v-model:open="open" :anchor="shell" role="listbox" auto-focus="none" match-width padding="sm">
    <ComboboxList
      :id="listId"
      :options="results"
      :active-index="activeIndex"
      :selected="selectedSet"
      :loading="loading"
      :create-query="createQuery"
      :empty-text="emptyText"
      :aria-label="ariaLabel"
      multiple
      @select="combobox.pick"
      @hover="activeIndex = $event"
    >
      <template v-if="$slots.option" #option="scope"><slot name="option" v-bind="scope" /></template>
      <template v-if="$slots.create" #create="scope"><slot name="create" v-bind="scope" /></template>
      <template v-if="$slots.empty" #empty><slot name="empty" /></template>
    </ComboboxList>
  </Popover>
</template>
