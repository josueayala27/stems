<script setup lang="ts" generic="Row">
import { css } from 'styled-system/css'
import { useElementSize } from '@vueuse/core'
import { computed, ref } from 'vue'
import Checkbox from './Checkbox.vue'
import Spinner from './Spinner.vue'
import { Icon } from '#components'
import { nextSort, selectRange, sortRows, virtualWindow, type TableSort } from './lib/table'
import type { DataTableColumn } from './types'

const props = withDefaults(
  defineProps<{
    rows: readonly Row[]
    columns: readonly DataTableColumn<Row>[]
    /** Property name or function giving each row a unique string key. */
    rowKey: (keyof Row & string) | ((row: Row) => string)
    /** Sort the rows in the component. Off by default: the parent sorts (e.g. on the server) from `v-model:sort`. */
    sortLocally?: boolean
    /** Adds a checkbox column bound to `v-model:selected`. Shift-click selects a range. */
    selectable?: boolean
    loading?: boolean
    emptyText?: string
    /** Fixed row height in px; virtualization relies on it. */
    rowHeight?: number
    /** Row count from which only the visible rows are rendered. */
    virtualizeAt?: number
    /** Highlights one row, e.g. the item open in an editor. */
    activeKey?: string | null
    ariaLabel?: string
    /** Row press (click or Enter). Declared as a prop so rows only look clickable when it is bound. */
    onRowClick?: (row: Row, event: MouseEvent | KeyboardEvent) => void
  }>(),
  {
    sortLocally: false,
    selectable: false,
    loading: false,
    emptyText: 'No results',
    rowHeight: 32,
    virtualizeAt: 200,
    activeKey: null,
    ariaLabel: undefined,
    onRowClick: undefined,
  },
)

const sort = defineModel<TableSort | null>('sort', { default: null })
const selected = defineModel<string[]>('selected', { default: () => [] })

defineSlots<
  {
    [cell: `cell-${string}`]: (scope: { row: Row; value: unknown; index: number }) => unknown
  } & {
    [header: `header-${string}`]: (scope: { column: DataTableColumn<Row> }) => unknown
  } & {
    empty?: () => unknown
    loading?: () => unknown
  }
>()

function keyOf(row: Row): string {
  const k = props.rowKey
  return typeof k === 'function' ? k(row) : String(row[k])
}

function valueOf(row: Row, column: DataTableColumn<Row>): unknown {
  if (column.accessor) return column.accessor(row)
  return row && typeof row === 'object' ? (row as Record<string, unknown>)[column.key] : undefined
}

const displayRows = computed<readonly Row[]>(() => {
  const s = sort.value
  if (!props.sortLocally || !s) return props.rows
  const column = props.columns.find((c) => c.key === s.key)
  return column ? sortRows(props.rows, (row) => valueOf(row, column), s.direction) : props.rows
})

const keys = computed(() => displayRows.value.map(keyOf))

// Virtualization: fixed row height, spacer rows above and below the rendered window.
const scroller = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const { height: viewportHeight } = useElementSize(scroller)
const virtual = computed(() => displayRows.value.length >= props.virtualizeAt)
const range = computed(() => {
  const count = displayRows.value.length
  if (!virtual.value) return { start: 0, end: count, padTop: 0, padBottom: 0 }
  return virtualWindow(scrollTop.value, viewportHeight.value || 600, props.rowHeight, count)
})
const visibleRows = computed(() =>
  displayRows.value.slice(range.value.start, range.value.end).map((row, i) => ({ row, index: range.value.start + i, key: keys.value[range.value.start + i]! })),
)

function onScroll(event: Event): void {
  if (virtual.value && event.target instanceof HTMLElement) scrollTop.value = event.target.scrollTop
}

// Selection
const selectedSet = computed(() => new Set(selected.value))
const pageSelected = computed(() => keys.value.filter((k) => selectedSet.value.has(k)).length)
const allSelected = computed(() => keys.value.length > 0 && pageSelected.value === keys.value.length)
const someSelected = computed(() => pageSelected.value > 0 && !allSelected.value)
let anchor: string | null = null
let shiftPressed = false

function rememberShift(event: MouseEvent): void {
  shiftPressed = event.shiftKey
}

function toggleRow(key: string): void {
  selected.value = selectRange(keys.value, selected.value, key, anchor, shiftPressed)
  anchor = key
  shiftPressed = false
}

function toggleAll(): void {
  const page = new Set(keys.value)
  selected.value = allSelected.value ? selected.value.filter((k) => !page.has(k)) : [...new Set([...selected.value, ...keys.value])]
  anchor = null
}

// Sorting
function onSort(column: DataTableColumn<Row>): void {
  if (column.sortable) sort.value = nextSort(sort.value, column.key)
}

function ariaSort(column: DataTableColumn<Row>): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable) return undefined
  if (sort.value?.key !== column.key) return 'none'
  return sort.value.direction === 'asc' ? 'ascending' : 'descending'
}

function sortIcon(column: DataTableColumn<Row>): string {
  if (sort.value?.key !== column.key) return 'lucide:chevrons-up-down'
  return sort.value.direction === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'
}

// Rows
const clickable = computed(() => Boolean(props.onRowClick))

function onRowClick(row: Row, event: MouseEvent): void {
  props.onRowClick?.(row, event)
}

function onRowKeydown(row: Row, event: KeyboardEvent): void {
  if (event.key === 'Enter' && event.target === event.currentTarget) {
    event.preventDefault()
    props.onRowClick?.(row, event)
  }
}

function display(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleString()
  return String(value)
}

const colCount = computed(() => props.columns.length + (props.selectable ? 1 : 0))
const rowStyle = computed(() => ({ height: `${props.rowHeight}px` }))

const scrollerClass = css({ position: 'relative', h: 'full', w: 'full', overflow: 'auto', bg: 'bg.panel' })
const table = css({
  w: 'full',
  tableLayout: 'fixed',
  borderCollapse: 'separate',
  borderSpacing: '0',
  textStyle: 'ui.sm',
  color: 'fg.default',
  '& th, & td': {
    px: '3',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderBottomWidth: '1px',
    borderColor: 'border.default',
    verticalAlign: 'middle',
  },
  '& [data-align=center]': { textAlign: 'center' },
  '& [data-align=right]': { textAlign: 'right' },
  '& [data-part=check]': { w: '[36px]', px: '0', textAlign: 'center', userSelect: 'none' },
  '& [data-part=state]': { h: '[120px]', textAlign: 'center', color: 'fg.subtle', whiteSpace: 'normal' },
  '&[aria-busy=true] tbody': { opacity: 0.6 },
})
const head = css({
  position: 'sticky',
  top: '0',
  zIndex: 'overlay',
  bg: 'bg.panel',
  '& th': { h: 'control.lg', textStyle: 'ui.label', color: 'fg.muted', fontWeight: 'semibold' },
})
const sortButton = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  maxW: 'full',
  color: 'inherit',
  cursor: 'pointer',
  borderRadius: 'xs',
  _hover: { color: 'fg.default' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[2px]' },
  '& [data-part=sort-icon]': { color: 'fg.subtle', flexShrink: 0 },
  '&[data-sorted] [data-part=sort-icon]': { color: 'fg.default' },
})
const srOnly = css({ srOnly: true })
const row = css({
  transitionProperty: 'background-color',
  transitionDuration: 'fast',
  _hover: { bg: 'bg.hover' },
  '&[data-selected]': { bg: 'accent.muted' },
  '&[data-active]': { bg: 'bg.active' },
  '&[data-clickable]': { cursor: 'pointer' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[-2px]' },
})
const spacer = css({ '& td': { p: '0', borderWidth: '0' } })

defineExpose({ scroller })
</script>

<template>
  <div ref="scroller" :class="scrollerClass" @scroll.passive="onScroll">
    <table :class="table" :aria-label="ariaLabel" :aria-busy="loading || undefined" :aria-rowcount="virtual ? displayRows.length + 1 : undefined">
      <colgroup>
        <col v-if="selectable" :style="{ width: '36px' }" />
        <col v-for="column in columns" :key="column.key" :style="column.width ? { width: column.width } : undefined" />
      </colgroup>
      <thead :class="head">
        <tr>
          <th v-if="selectable" data-part="check" scope="col">
            <Checkbox :model-value="allSelected" :indeterminate="someSelected" :disabled="keys.length === 0" aria-label="Select all rows" @update:model-value="toggleAll" />
          </th>
          <th v-for="column in columns" :key="column.key" scope="col" :data-align="column.align" :aria-sort="ariaSort(column)">
            <slot :name="`header-${column.key}`" :column="column">
              <span v-if="column.hideHeader" :class="srOnly">{{ column.header }}</span>
              <button v-else-if="column.sortable" type="button" :class="sortButton" :data-sorted="sort?.key === column.key || undefined" @click="onSort(column)">
                <span>{{ column.header }}</span>
                <Icon :name="sortIcon(column)" :size="12" data-part="sort-icon" aria-hidden="true" />
              </button>
              <template v-else>{{ column.header }}</template>
            </slot>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="displayRows.length === 0">
          <td :colspan="colCount" data-part="state">
            <slot v-if="loading" name="loading"><Spinner :size="16" /></slot>
            <slot v-else name="empty">{{ emptyText }}</slot>
          </td>
        </tr>
        <tr v-if="range.padTop > 0" :class="spacer" aria-hidden="true" :style="{ height: `${range.padTop}px` }"><td :colspan="colCount" /></tr>
        <tr
          v-for="item in visibleRows"
          :key="item.key"
          :class="row"
          :style="rowStyle"
          :aria-rowindex="virtual ? item.index + 2 : undefined"
          :aria-selected="selectable ? selectedSet.has(item.key) : undefined"
          :data-selected="selectedSet.has(item.key) || undefined"
          :data-active="activeKey === item.key || undefined"
          :data-clickable="clickable || undefined"
          :tabindex="clickable ? 0 : undefined"
          @click="onRowClick(item.row, $event)"
          @keydown="onRowKeydown(item.row, $event)"
        >
          <td v-if="selectable" data-part="check" @click.capture="rememberShift" @click.stop>
            <Checkbox
              :model-value="selectedSet.has(item.key)"
              :aria-label="`Select row ${item.index + 1}`"
              @update:model-value="toggleRow(item.key)"
            />
          </td>
          <td v-for="column in columns" :key="column.key" :data-align="column.align">
            <slot :name="`cell-${column.key}`" :row="item.row" :value="valueOf(item.row, column)" :index="item.index">{{ display(valueOf(item.row, column)) }}</slot>
          </td>
        </tr>
        <tr v-if="range.padBottom > 0" :class="spacer" aria-hidden="true" :style="{ height: `${range.padBottom}px` }"><td :colspan="colCount" /></tr>
      </tbody>
    </table>
  </div>
</template>
