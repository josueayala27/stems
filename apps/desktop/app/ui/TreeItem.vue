<script setup lang="ts">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { token } from 'styled-system/tokens'
import { computed, nextTick, ref, watch } from 'vue'

/**
 * One row of a hierarchical list (layers, pages). Purely presentational: the
 * parent owns tree keyboard navigation, roving tabindex and drag-and-drop.
 * Native listeners (dragstart, dragover, drop, contextmenu, keydown, …) fall
 * through to the row element.
 */
const props = withDefaults(
  defineProps<{
    label: string
    icon?: string
    /** 0-based nesting level; drives indentation and `aria-level`. */
    depth?: number
    expandable?: boolean
    selected?: boolean
    /** Hovered from elsewhere (e.g. the canvas). */
    highlighted?: boolean
    /** Hidden/inactive items render muted. */
    dimmed?: boolean
    /** Render an inline rename field instead of the label. */
    editing?: boolean
    /** Drop feedback while the parent runs a drag. */
    dropIndicator?: 'before' | 'after' | 'inside' | null
    draggable?: boolean
  }>(),
  {
    icon: undefined,
    depth: 0,
    expandable: false,
    selected: false,
    highlighted: false,
    dimmed: false,
    editing: false,
    dropIndicator: null,
    draggable: false,
  },
)

const expanded = defineModel<boolean>('expanded', { default: false })

const emit = defineEmits<{
  /** Row pressed; inspect the event for Shift/Mod multi-select. */
  select: [event: MouseEvent]
  /** Label double-clicked: the parent may switch `editing` on. */
  renameRequest: []
  /** Trimmed new name; `''` means clear the custom name. */
  rename: [value: string]
  renameCancel: []
}>()

defineSlots<{ icon?: () => unknown; label?: () => unknown; actions?: () => unknown; trailing?: () => unknown }>()

const input = ref<HTMLInputElement | null>(null)
let finished = false

watch(
  () => props.editing,
  async (editing) => {
    if (!editing) return
    finished = false
    await nextTick()
    input.value?.focus()
    input.value?.select()
  },
  { immediate: true },
)

function finishRename(commit: boolean): void {
  if (finished) return
  finished = true
  // A blank commit emits '' so the parent can clear the custom name.
  if (commit && input.value) emit('rename', input.value.value.trim())
  else emit('renameCancel')
}

function onRenameKeydown(event: KeyboardEvent): void {
  event.stopPropagation()
  if (event.key === 'Enter') finishRename(true)
  else if (event.key === 'Escape') finishRename(false)
}

function toggle(): void {
  expanded.value = !expanded.value
}

const INDENT = token.var('spacing.3')
const indent = computed(() => ({
  paddingLeft: `calc(${token.var('spacing.1')} + ${props.depth} * ${INDENT})`,
  '--drop-indent': `calc(${props.depth + 1} * ${INDENT})`,
}))

const row = cva({
  base: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '1',
    h: 'control.md',
    pr: '1.5',
    borderRadius: 'xs',
    textStyle: 'ui.sm',
    color: 'fg.default',
    cursor: 'default',
    outline: 'none',
    _hover: { bg: 'bg.hover', '& [data-part=actions]': { opacity: 1 } },
    _focusVisible: { boxShadow: 'none', outlineWidth: '1px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[-1px]' },
    _focusWithin: { '& [data-part=actions]': { opacity: 1 } },
    '& [data-part=icon]': { color: 'fg.muted', flexShrink: 0 },
  },
  variants: {
    selected: {
      true: {
        bg: 'accent.muted',
        _hover: { bg: 'accent.muted' },
        '& [data-part=icon]': { color: 'accent.hover' },
        '& [data-part=actions]': { opacity: 1 },
      },
    },
    highlighted: { true: { bg: 'bg.hover' } },
    dimmed: { true: { color: 'fg.subtle', '& [data-part=icon]': { color: 'fg.subtle' } } },
    drop: {
      none: {},
      inside: { outlineWidth: '1px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[-1px]', bg: 'accent.muted' },
      before: { _before: { content: '""', position: 'absolute', left: 'var(--drop-indent)', right: '0', top: '[-1px]', h: '0.5', bg: 'accent.default', borderRadius: 'full' } },
      after: { _after: { content: '""', position: 'absolute', left: 'var(--drop-indent)', right: '0', bottom: '[-1px]', h: '0.5', bg: 'accent.default', borderRadius: 'full' } },
    },
  },
})

const chevron = cva({
  base: {
    display: 'grid',
    placeItems: 'center',
    w: '4',
    h: '4',
    flexShrink: 0,
    borderRadius: 'xs',
    color: 'fg.subtle',
    transitionProperty: 'transform, color',
    transitionDuration: 'fast',
    transitionTimingFunction: 'standard',
    _hover: { color: 'fg.default' },
  },
  variants: { expanded: { true: { transform: 'rotate(90deg)' } } },
})
const spacer = css({ w: '4', flexShrink: 0 })
const labelClass = css({ flex: '1', minW: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const renameInput = css({
  flex: '1',
  minW: '0',
  h: 'control.sm',
  px: '1',
  ml: '-1',
  borderRadius: 'xs',
  bg: 'bg.input',
  color: 'fg.default',
  outlineWidth: '1px',
  outlineStyle: 'solid',
  outlineColor: 'accent.default',
  userSelect: 'text',
})
const actions = css({ display: 'flex', alignItems: 'center', gap: '0.5', opacity: 0, transitionProperty: 'opacity', transitionDuration: 'fast' })
const trailing = css({ display: 'flex', alignItems: 'center', gap: '0.5', color: 'fg.subtle' })
</script>

<template>
  <div
    role="treeitem"
    :aria-level="depth + 1"
    :aria-expanded="expandable ? expanded : undefined"
    :aria-selected="selected"
    :draggable="draggable && !editing"
    :class="row({ selected, highlighted: highlighted && !selected, dimmed, drop: dropIndicator ?? 'none' })"
    :style="indent"
    @click="emit('select', $event)"
  >
    <button
      v-if="expandable"
      type="button"
      tabindex="-1"
      :aria-label="expanded ? 'Collapse' : 'Expand'"
      :class="chevron({ expanded })"
      @click.stop="toggle"
      @dblclick.stop
    >
      <Icon name="lucide:chevron-right" :size="12" aria-hidden="true" />
    </button>
    <span v-else :class="spacer" />
    <slot name="icon">
      <Icon v-if="icon" data-part="icon" :name="icon" :size="14" aria-hidden="true" />
    </slot>
    <input
      v-if="editing"
      ref="input"
      :class="renameInput"
      :value="label"
      aria-label="Rename"
      spellcheck="false"
      @keydown="onRenameKeydown"
      @blur="finishRename(true)"
      @click.stop
      @dblclick.stop
    />
    <span v-else :class="labelClass" @dblclick="emit('renameRequest')">
      <slot name="label">{{ label }}</slot>
    </span>
    <span v-if="$slots.actions" data-part="actions" :class="actions" @click.stop>
      <slot name="actions" />
    </span>
    <span v-if="$slots.trailing" :class="trailing"><slot name="trailing" /></span>
  </div>
</template>
