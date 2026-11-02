<script setup lang="ts">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { token } from 'styled-system/tokens'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useClipboard } from './composables/useClipboard'
import IconButton from './IconButton.vue'
import { formatPath, getAtPath, parsePath, type PathSegment } from './lib/jsonPath'
import {
  copyText,
  expandedToDepth,
  flattenJson,
  JSON_TREE_MAX_DEPTH,
  JSON_TREE_PAGE_SIZE,
  previewValue,
  type JsonNodeRow,
  type JsonTreeRow,
  type JsonTreeCopyEvent,
  type JsonTreeSelectEvent,
} from './lib/jsonTree'
import { matchesShortcut } from './lib/shortcut'

/**
 * Read-only JSON viewer. Rows are a flat ARIA tree (`aria-level`), with roving
 * focus, per-node and global expand/collapse, copy value / copy path, and
 * containers longer than `pageSize` cut off behind a "show more" row.
 */
const props = withDefaults(
  defineProps<{
    value: unknown
    /** Levels opened initially (root = 1). `0` starts collapsed. */
    expandDepth?: number
    /** Containers at this depth do not open (guards huge or deep values). */
    maxDepth?: number
    /** Children shown per container before a "show more" row. */
    pageSize?: number
    /** Prefix for copied paths, e.g. `query.result` gives `query.result.items[0]`. */
    basePath?: string
    /** Label for the root row; without it the root shows only its preview. */
    rootLabel?: string
    /** Expand all / collapse all buttons above the tree. */
    toolbar?: boolean
    copyable?: boolean
    ariaLabel?: string
    /**
     * Paths to highlight, in the form `select-path` emits (`basePath` included,
     * arrays as `[0]`: `item.tags[0]`, `queries.products.data[0].title`). A path
     * without the `basePath` prefix is read from the root of `value`. Ancestors of
     * marked rows open, and "show more" windows grow to reach them.
     */
    marked?: readonly string[]
  }>(),
  {
    expandDepth: 1,
    maxDepth: JSON_TREE_MAX_DEPTH,
    pageSize: JSON_TREE_PAGE_SIZE,
    basePath: '',
    rootLabel: undefined,
    toolbar: true,
    copyable: true,
    ariaLabel: 'JSON value',
    marked: () => [],
  },
)

const emit = defineEmits<{
  /** A node was activated (click or Enter). `path` includes `basePath`. */
  select: [event: JsonTreeSelectEvent]
  /**
   * A key row was activated (click or Enter): its dotted path with `basePath`,
   * arrays as `[0]` (`queries.products.data[0].title`). Not sent for the root row
   * when `basePath` is empty.
   */
  'select-path': [path: string]
  copy: [event: JsonTreeCopyEvent]
}>()

const limits = shallowRef(new Map<string, number>())
const expanded = shallowRef(initialExpanded(props.value))

function initialExpanded(value: unknown): Set<string> {
  return expandedToDepth(value, props.expandDepth, { pageSize: props.pageSize, maxDepth: props.maxDepth })
}

/** `marked` as segments relative to `value`; unparsable paths are skipped. */
const markedSegments = computed<PathSegment[][]>(() => {
  const base = props.basePath
  const list: PathSegment[][] = []
  for (const path of props.marked) {
    let relative = path
    if (base && (path === base || path.startsWith(`${base}.`) || path.startsWith(`${base}[`))) {
      relative = path.slice(base.length).replace(/^\./, '')
    }
    const segments = parsePath(relative)
    if (segments) list.push(segments)
  }
  return list
})
const markedIds = computed(() => new Set(markedSegments.value.map((segments) => formatPath(segments))))

/** Opens the ancestors of marked rows and widens paged containers so they show. */
function revealMarked(): void {
  const open = new Set(expanded.value)
  const nextLimits = new Map(limits.value)
  for (const segments of markedSegments.value) {
    for (let depth = 0; depth < segments.length; depth++) {
      const parentPath = segments.slice(0, depth)
      const parentId = formatPath(parentPath)
      open.add(parentId)
      const parent = getAtPath(props.value, parentPath)
      const key = segments[depth]!
      const position = Array.isArray(parent) ? Number(key) : parent !== null && typeof parent === 'object' ? Object.keys(parent).indexOf(String(key)) : -1
      if (position >= props.pageSize) {
        const needed = Math.ceil((position + 1) / props.pageSize) * props.pageSize
        if (needed > (nextLimits.get(parentId) ?? props.pageSize)) nextLimits.set(parentId, needed)
      }
    }
  }
  expanded.value = open
  limits.value = nextLimits
}

// Keep what the user opened; new values also open to `expandDepth`.
watch(
  () => props.value,
  (value) => {
    expanded.value = new Set([...expanded.value, ...initialExpanded(value)])
    revealMarked()
  },
)
watch(markedSegments, revealMarked, { immediate: true })

const rows = computed<JsonTreeRow[]>(() =>
  flattenJson(props.value, { expanded: expanded.value, limits: limits.value, pageSize: props.pageSize, maxDepth: props.maxDepth }),
)

const activeId = ref<string>('')
const activeIndex = computed(() => {
  const index = rows.value.findIndex((row) => row.id === activeId.value)
  return index >= 0 ? index : 0
})

const rowEls = new Map<string, HTMLElement>()
function setRowEl(id: string, el: unknown): void {
  if (el instanceof HTMLElement) rowEls.set(id, el)
  else rowEls.delete(id)
}

async function focusRow(id: string): Promise<void> {
  activeId.value = id
  await nextTick()
  rowEls.get(id)?.focus()
}

function setExpanded(id: string, open: boolean): void {
  const next = new Set(expanded.value)
  if (open) next.add(id)
  else next.delete(id)
  expanded.value = next
}

function toggle(row: JsonNodeRow): void {
  if (row.expandable) setExpanded(row.id, !row.expanded)
}

function showMore(parentId: string, shown: number): void {
  const next = new Map(limits.value)
  next.set(parentId, shown + props.pageSize)
  limits.value = next
}

function expandAll(): void {
  expanded.value = expandedToDepth(props.value, Infinity, { pageSize: props.pageSize, maxDepth: props.maxDepth, limits: limits.value })
}

function collapseAll(): void {
  expanded.value = new Set()
  activeId.value = ''
}

const { copy, copied } = useClipboard()

function fullPath(row: JsonTreeRow): string {
  return formatPath(row.path, props.basePath)
}

async function copyRow(row: JsonNodeRow, kind: 'value' | 'path'): Promise<void> {
  const text = kind === 'value' ? copyText(row.type === 'circular' ? '[Circular]' : row.value) : fullPath(row)
  if (await copy(text, `${kind}:${row.id}`)) emit('copy', { kind, text, path: fullPath(row) })
}

function activate(row: JsonTreeRow): void {
  activeId.value = row.id
  if (row.kind === 'more') {
    showMore(row.parentId, row.shown)
    return
  }
  const path = fullPath(row)
  emit('select', { path, segments: row.path, value: row.value })
  if (path !== '') emit('select-path', path)
}

function parentIndex(index: number): number {
  const depth = rows.value[index]!.depth
  for (let i = index - 1; i >= 0; i--) if (rows.value[i]!.depth < depth) return i
  return -1
}

function onKeydown(event: KeyboardEvent): void {
  const list = rows.value
  const index = activeIndex.value
  const row = list[index]
  if (!row) return
  const go = (i: number) => {
    const target = list[Math.max(0, Math.min(list.length - 1, i))]
    if (target) void focusRow(target.id)
  }

  if (row.kind === 'node' && props.copyable && matchesShortcut(event, 'Mod+Shift+C')) {
    event.preventDefault()
    void copyRow(row, 'path')
    return
  }
  if (row.kind === 'node' && props.copyable && matchesShortcut(event, 'Mod+C')) {
    event.preventDefault()
    void copyRow(row, 'value')
    return
  }

  switch (event.key) {
    case 'ArrowDown':
      go(index + 1)
      break
    case 'ArrowUp':
      go(index - 1)
      break
    case 'Home':
      go(0)
      break
    case 'End':
      go(list.length - 1)
      break
    case 'ArrowRight':
      if (row.kind !== 'node' || !row.expandable) return
      if (!row.expanded) setExpanded(row.id, true)
      else go(index + 1)
      break
    case 'ArrowLeft':
      if (row.kind === 'node' && row.expanded) setExpanded(row.id, false)
      else if (parentIndex(index) >= 0) go(parentIndex(index))
      break
    case '*':
      expandSiblings(index)
      break
    case 'Enter':
    case ' ':
      if (event.key === ' ' && row.kind === 'node' && row.expandable) toggle(row)
      else activate(row)
      break
    default:
      return
  }
  event.preventDefault()
}

/** APG tree: `*` opens every sibling of the focused node. */
function expandSiblings(index: number): void {
  const parent = parentIndex(index)
  const depth = rows.value[index]!.depth
  const next = new Set(expanded.value)
  for (let i = parent + 1; i < rows.value.length; i++) {
    const row = rows.value[i]!
    if (row.depth < depth) break
    if (row.depth === depth && row.kind === 'node' && row.expandable) next.add(row.id)
  }
  expanded.value = next
}

function keyLabel(row: JsonNodeRow): string | null {
  if (row.key === null) return props.rootLabel ?? null
  return String(row.key)
}

function ariaLabelFor(row: JsonTreeRow): string {
  if (row.kind === 'more') return `Show ${Math.min(props.pageSize, row.total - row.shown)} more of ${row.total}`
  const key = keyLabel(row)
  const preview = previewValue(row.value, row.type)
  return key === null ? preview : `${key}: ${preview}`
}

defineExpose({ expandAll, collapseAll, focus: () => focusRow(rows.value[activeIndex.value]?.id ?? '') })

const INDENT = token.var('spacing.3')
function indent(depth: number): Record<string, string> {
  return { paddingLeft: `calc(${token.var('spacing.1')} + ${depth} * ${INDENT})` }
}

const root = css({ display: 'flex', flexDirection: 'column', minW: '0', textStyle: 'ui.mono', color: 'fg.default' })
const toolbarClass = css({ display: 'flex', justifyContent: 'flex-end', gap: '0.5', pb: '1' })
const tree = css({ display: 'flex', flexDirection: 'column', minW: '0' })
const rowClass = cva({
  base: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '1',
    minH: '5',
    pr: '1',
    borderRadius: 'xs',
    cursor: 'default',
    whiteSpace: 'nowrap',
    _hover: { bg: 'bg.hover', '& [data-part=actions]': { opacity: 1 } },
    _focusVisible: { outlineWidth: '1px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[-1px]', '& [data-part=actions]': { opacity: 1 } },
  },
  variants: {
    active: { true: { bg: 'bg.subtle' }, false: {} },
    // After `active` so a marked row stays marked while focused.
    marked: { true: { bg: 'accent.muted', _hover: { bg: 'accent.muted' } }, false: {} },
  },
})
const chevron = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  w: '3.5',
  h: '3.5',
  flexShrink: 0,
  color: 'fg.subtle',
  transitionProperty: 'transform',
  transitionDuration: 'fast',
  transitionTimingFunction: 'standard',
  '&[data-open=true]': { transform: 'rotate(90deg)' },
})
const keyClass = cva({
  base: { flexShrink: 0, color: 'fg.default' },
  variants: { index: { true: { color: 'fg.subtle' }, false: {} } },
})
const valueClass = cva({
  base: { minW: '0', overflow: 'hidden', textOverflow: 'ellipsis' },
  variants: {
    type: {
      string: { color: 'success.default' },
      number: { color: 'info.default' },
      boolean: { color: 'warning.default' },
      null: { color: 'fg.subtle', fontStyle: 'italic' },
      undefined: { color: 'fg.subtle', fontStyle: 'italic' },
      circular: { color: 'danger.default' },
      object: { color: 'fg.muted' },
      array: { color: 'fg.muted' },
      other: { color: 'fg.muted' },
    },
  },
})
const actions = css({ display: 'flex', gap: '0.5', ml: 'auto', pl: '2', opacity: 0, transitionProperty: 'opacity', transitionDuration: 'fast' })
const more = css({ color: 'accent.default', _hover: { textDecoration: 'underline' } })
const limitNote = css({ color: 'fg.subtle', fontStyle: 'italic' })
</script>

<template>
  <div :class="root">
    <div v-if="toolbar" :class="toolbarClass">
      <IconButton icon="lucide:chevrons-up-down" label="Expand all" size="sm" @click="expandAll" />
      <IconButton icon="lucide:chevrons-down-up" label="Collapse all" size="sm" @click="collapseAll" />
    </div>
    <div role="tree" :aria-label="ariaLabel" aria-keyshortcuts="Control+C Meta+C Control+Shift+C Meta+Shift+C" :class="tree" @keydown="onKeydown">
      <template v-for="(row, index) in rows" :key="row.id">
        <div
          v-if="row.kind === 'node'"
          :ref="(el) => setRowEl(row.id, el)"
          role="treeitem"
          :aria-level="row.depth + 1"
          :aria-setsize="row.setsize"
          :aria-posinset="row.posinset"
          :aria-expanded="row.expandable ? row.expanded : undefined"
          :aria-label="ariaLabelFor(row)"
          :tabindex="index === activeIndex ? 0 : -1"
          :data-type="row.type"
          :data-path="row.id"
          :data-marked="markedIds.has(row.id) || undefined"
          :class="rowClass({ active: index === activeIndex && activeId !== '', marked: markedIds.has(row.id) })"
          :style="indent(row.depth)"
          @click="activate(row)"
          @dblclick="toggle(row)"
        >
          <span :class="chevron" :data-open="row.expanded" aria-hidden="true" @click.stop="toggle(row); activeId = row.id">
            <Icon v-if="row.expandable" name="lucide:chevron-right" size="12" />
          </span>
          <template v-if="keyLabel(row) !== null">
            <span :class="keyClass({ index: typeof row.key === 'number' })">{{ keyLabel(row) }}</span>
            <span :class="keyClass({ index: true })" aria-hidden="true">:</span>
          </template>
          <span :class="valueClass({ type: row.type })">{{ previewValue(row.value, row.type) }}</span>
          <span v-if="row.depthLimited" :class="limitNote">max depth</span>
          <span v-if="copyable" data-part="actions" :class="actions">
            <IconButton
              :icon="copied === `path:${row.id}` ? 'lucide:check' : 'lucide:link'"
              label="Copy path"
              size="sm"
              tabindex="-1"
              @click.stop="copyRow(row, 'path')"
            />
            <IconButton
              :icon="copied === `value:${row.id}` ? 'lucide:check' : 'lucide:copy'"
              label="Copy value"
              size="sm"
              tabindex="-1"
              @click.stop="copyRow(row, 'value')"
            />
          </span>
        </div>
        <div
          v-else
          :ref="(el) => setRowEl(row.id, el)"
          role="treeitem"
          :aria-level="row.depth + 1"
          :aria-setsize="row.setsize"
          :aria-posinset="row.posinset"
          :aria-label="ariaLabelFor(row)"
          :tabindex="index === activeIndex ? 0 : -1"
          :class="rowClass({ active: false, marked: false })"
          :style="indent(row.depth)"
          @click="activate(row)"
        >
          <span :class="chevron" aria-hidden="true" />
          <span :class="more">Show {{ Math.min(pageSize, row.total - row.shown) }} more ({{ row.total - row.shown }} hidden)</span>
        </div>
      </template>
    </div>
  </div>
</template>
