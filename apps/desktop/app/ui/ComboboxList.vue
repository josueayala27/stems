<script setup lang="ts">
// Listbox body shared by Combobox and MultiCombobox. Focus stays in the input
// (aria-activedescendant), so options never take focus.
import { Icon } from '#components'
import { css } from 'styled-system/css'
import { nextTick, watch } from 'vue'
import Spinner from './Spinner.vue'
import { optionId } from './composables/useCombobox'
import type { ComboboxOption } from './types'

const props = defineProps<{
  id: string
  options: readonly ComboboxOption[]
  activeIndex: number
  selected: ReadonlySet<string>
  loading: boolean
  /** Query for the trailing "Create" row, or null when it is hidden. */
  createQuery: string | null
  emptyText: string
  multiple?: boolean
  ariaLabel?: string
}>()

const emit = defineEmits<{ select: [index: number]; hover: [index: number] }>()

defineSlots<{
  option?: (scope: { option: ComboboxOption; selected: boolean; active: boolean }) => unknown
  create?: (scope: { query: string }) => unknown
  empty?: () => unknown
}>()

watch(
  () => props.activeIndex,
  async (index) => {
    await nextTick()
    if (typeof document === 'undefined' || index < 0) return
    document.getElementById(optionId(props.id, index))?.scrollIntoView?.({ block: 'nearest' })
  },
)

const list = css({ display: 'flex', flexDirection: 'column', gap: '0.5', outline: 'none' })
const item = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  minH: 'control.md',
  px: '2',
  py: '1',
  borderRadius: 'xs',
  textStyle: 'ui.sm',
  color: 'fg.default',
  cursor: 'pointer',
  userSelect: 'none',
  '&[data-active]': { bg: 'bg.hover' },
  '&[aria-disabled=true]': { opacity: 0.4, cursor: 'default' },
  '& [data-part=text]': { display: 'flex', flexDirection: 'column', flex: '1', minW: '0' },
  '& [data-part=label]': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& [data-part=description]': { textStyle: 'ui.xs', color: 'fg.subtle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& [data-part=check]': { color: 'accent.default', flexShrink: 0 },
  '& [data-part=icon]': { color: 'fg.muted', flexShrink: 0 },
})
const status = css({ display: 'flex', alignItems: 'center', gap: '2', px: '2', py: '1.5', textStyle: 'ui.sm', color: 'fg.subtle' })
</script>

<template>
  <div :id="id" role="listbox" :aria-label="ariaLabel" :aria-multiselectable="multiple || undefined" :aria-busy="loading || undefined" :class="list">
    <div
      v-for="(option, index) in options"
      :id="optionId(id, index)"
      :key="option.value"
      role="option"
      :aria-selected="selected.has(option.value)"
      :aria-disabled="option.disabled || undefined"
      :data-active="index === activeIndex || undefined"
      :class="item"
      @mousedown.prevent
      @mousemove="emit('hover', index)"
      @click="!option.disabled && emit('select', index)"
    >
      <slot name="option" :option="option" :selected="selected.has(option.value)" :active="index === activeIndex">
        <Icon v-if="option.icon" :name="option.icon" :size="14" data-part="icon" aria-hidden="true" />
        <span data-part="text">
          <span data-part="label">{{ option.label }}</span>
          <span v-if="option.description" data-part="description">{{ option.description }}</span>
        </span>
        <Icon v-if="selected.has(option.value)" name="lucide:check" :size="14" data-part="check" aria-hidden="true" />
      </slot>
    </div>
    <div
      v-if="createQuery !== null"
      :id="optionId(id, options.length)"
      role="option"
      :aria-selected="false"
      :data-active="activeIndex === options.length || undefined"
      :class="item"
      @mousedown.prevent
      @mousemove="emit('hover', options.length)"
      @click="emit('select', options.length)"
    >
      <slot name="create" :query="createQuery">
        <Icon name="lucide:plus" :size="14" data-part="icon" aria-hidden="true" />
        <span data-part="text"><span data-part="label">Create “{{ createQuery }}”</span></span>
      </slot>
    </div>
    <div v-if="loading && options.length === 0" :class="status" role="status"><Spinner :size="12" /> Searching…</div>
    <div v-else-if="options.length === 0 && createQuery === null" :class="status" role="status">
      <slot name="empty">{{ emptyText }}</slot>
    </div>
  </div>
</template>
