<script setup lang="ts" generic="T">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useSortableGroup } from './composables/useSortableGroup'
import { slotToMove, type SortableHandleProps, type SortableMove, type SortablePosition } from './lib/sortable'
import { matchesShortcut } from './lib/shortcut'

/**
 * A reorderable list. It never changes `items` itself: it emits `move` and the
 * caller applies it (`applyMove` helps). Lists with the same `group` nested
 * inside items form one tree, and items can move between them.
 *
 * Pointer: drag the handle. Keyboard on the handle: ⌥↑/⌥↓ moves one step;
 * Space grabs, ↑/↓ walks every drop position in the group (nested lists too),
 * Space/Enter drops, Esc cancels.
 */
const props = withDefaults(
  defineProps<{
    items: T[]
    /** Unique within the group; reported in `move` events. */
    listId: string
    /** Stable key per item: a property name or a function. */
    itemKey: keyof T | ((item: T) => string)
    /** Lists sharing a group exchange items. */
    group?: string
    /** Accessible name per item, used by the handle and announcements. */
    itemLabel?: (item: T, index: number) => string
    /** Render the built-in grip; turn off to place `handleProps` on your own element. */
    showHandle?: boolean
    disabled?: boolean
    ariaLabel?: string
    /** Text in the drop zone of an empty list. */
    emptyText?: string
  }>(),
  { group: 'default', itemLabel: undefined, showHandle: true, disabled: false, ariaLabel: undefined, emptyText: 'Drop items here' },
)

const emit = defineEmits<{
  /** Emitted once, by the list the item came from. */
  move: [move: SortableMove]
}>()

defineSlots<{
  default: (props: { item: T; index: number; handleProps: SortableHandleProps; dragging: boolean; grabbed: boolean }) => unknown
  empty?: () => unknown
}>()

const group = useSortableGroup(props.group)
const listEl = ref<HTMLElement | null>(null)
const helpId = `${useId()}-sortable-help`

function keyOf(item: T): string {
  return typeof props.itemKey === 'function' ? props.itemKey(item) : String(item[props.itemKey])
}

function labelOf(item: T, index: number): string {
  return props.itemLabel?.(item, index) ?? `Item ${index + 1}`
}

const listLabel = computed(() => props.ariaLabel ?? 'list')

let unregister: (() => void) | null = null
// The outermost list of a group renders the live region; known only after mount.
const isRootList = ref(false)
onMounted(() => {
  isRootList.value = !listEl.value?.parentElement?.closest('[data-sortable-list]')
  unregister = group.register({
    listId: props.listId,
    el: () => listEl.value,
    count: () => props.items.length,
    label: () => listLabel.value,
    emitMove: (move) => emit('move', move),
  })
})
onBeforeUnmount(() => {
  unregister?.()
  if (group.drag.value?.from.listId === props.listId) endDrag()
})

const isTarget = computed(() => group.target.value?.listId === props.listId && group.drag.value !== null)
const indicatorAt = computed(() => (isTarget.value ? group.target.value!.index : -1))

function isDragging(index: number): boolean {
  const drag = group.drag.value
  return drag !== null && drag.from.listId === props.listId && drag.from.index === index
}

function announce(message: string): void {
  group.announcement.value = message
}

function describeSlot(slot: SortablePosition): string {
  const entry = group.lists.get(slot.listId)
  const count = entry?.count() ?? 0
  const sameList = group.drag.value?.from.listId === slot.listId
  const total = sameList ? count : count + 1
  const move = group.drag.value ? slotToMove(group.drag.value.from, slot) : null
  const position = move ? move.to.index + 1 : (group.drag.value?.from.index ?? 0) + 1
  return `Position ${position} of ${total} in ${entry?.label() ?? 'list'}`
}

function startDrag(index: number, mode: 'pointer' | 'keyboard'): void {
  const item = props.items[index]
  if (item === undefined) return
  group.drag.value = { from: { listId: props.listId, index }, key: keyOf(item), label: labelOf(item, index), mode }
  group.target.value = { listId: props.listId, index }
}

function endDrag(): void {
  group.drag.value = null
  group.target.value = null
}

async function drop(): Promise<void> {
  const drag = group.drag.value
  const slot = group.target.value
  endDrag()
  if (!drag || !slot) return
  const move = slotToMove(drag.from, slot)
  if (!move) {
    if (drag.mode === 'keyboard') announce(`${drag.label} dropped in its original position`)
    return
  }
  announce(`${drag.label} dropped. ${positionText(move)}`)
  await group.commit(move, drag.key)
}

function positionText(move: SortableMove): string {
  return `Position ${move.to.index + 1} in ${group.lists.get(move.to.listId)?.label() ?? 'list'}`
}

function cancel(): void {
  const drag = group.drag.value
  endDrag()
  if (drag?.mode === 'keyboard') announce(`Reorder cancelled. ${drag.label} is back in place`)
  if (drag) void group.focusHandle(drag.key)
}

// Pointer dragging -------------------------------------------------------------
const DRAG_THRESHOLD = 4
let pointer: { id: number; x: number; y: number; index: number; started: boolean; handle: HTMLElement } | null = null

function onPointerdown(event: PointerEvent, index: number): void {
  if (props.disabled || event.button !== 0 || group.drag.value) return
  const handle = event.currentTarget as HTMLElement
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, index, started: false, handle }
  handle.setPointerCapture?.(event.pointerId)
  handle.addEventListener('pointermove', onPointermove)
  handle.addEventListener('pointerup', onPointerup)
  handle.addEventListener('pointercancel', onPointercancel)
  event.preventDefault()
}

function onPointermove(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.id) return
  if (!pointer.started) {
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < DRAG_THRESHOLD) return
    pointer.started = true
    startDrag(pointer.index, 'pointer')
  }
  group.target.value = group.slotAt(event.clientX, event.clientY)
}

function releasePointer(): void {
  if (!pointer) return
  const { handle, id } = pointer
  handle.removeEventListener('pointermove', onPointermove)
  handle.removeEventListener('pointerup', onPointerup)
  handle.removeEventListener('pointercancel', onPointercancel)
  if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture(id)
  pointer = null
}

function onPointerup(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.id) return
  const started = pointer.started
  releasePointer()
  if (started) void drop()
}

function onPointercancel(): void {
  const started = pointer?.started
  releasePointer()
  if (started) endDrag()
}

onBeforeUnmount(releasePointer)

// Keyboard ---------------------------------------------------------------------
function onHandleKeydown(event: KeyboardEvent, index: number): void {
  if (props.disabled) return
  const drag = group.drag.value
  const grabbedHere = drag?.mode === 'keyboard' && drag.from.listId === props.listId && drag.from.index === index

  if (!drag && (matchesShortcut(event, 'Alt+ArrowUp') || matchesShortcut(event, 'Alt+ArrowDown'))) {
    event.preventDefault()
    const to = index + (event.key === 'ArrowUp' ? -1 : 1)
    const item = props.items[index]
    if (item === undefined || to < 0 || to >= props.items.length) return
    const move: SortableMove = { from: { listId: props.listId, index }, to: { listId: props.listId, index: to } }
    announce(`${labelOf(item, index)} moved. Position ${to + 1} of ${props.items.length}`)
    void group.commit(move, keyOf(item))
    return
  }

  if (event.key === ' ' || (event.key === 'Enter' && grabbedHere)) {
    event.preventDefault()
    if (grabbedHere) {
      void drop()
    } else if (!drag) {
      startDrag(index, 'keyboard')
      announce(`${group.drag.value?.label ?? 'Item'} grabbed. ${describeSlot(group.target.value!)}. Use the arrow keys to move, Space to drop, Escape to cancel.`)
    }
    return
  }

  if (!grabbedHere) return
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    const slots = group.slots()
    const current = group.target.value
    const at = slots.findIndex((s) => current && s.listId === current.listId && s.index === current.index)
    const next = slots[Math.max(0, Math.min(slots.length - 1, at + (event.key === 'ArrowUp' ? -1 : 1)))]
    if (next) {
      group.target.value = next
      announce(describeSlot(next))
    }
  }
}

function onHandleBlur(index: number): void {
  const drag = group.drag.value
  if (drag?.mode === 'keyboard' && drag.from.listId === props.listId && drag.from.index === index) cancel()
}

function handlePropsFor(item: T, index: number): SortableHandleProps {
  const drag = group.drag.value
  return {
    'data-sortable-handle': '',
    'aria-label': `Reorder ${labelOf(item, index)}`,
    'aria-describedby': helpId,
    'aria-pressed': drag?.mode === 'keyboard' && isDragging(index),
    'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown Space',
    disabled: props.disabled,
    onPointerdown: (event) => onPointerdown(event, index),
    onKeydown: (event) => onHandleKeydown(event, index),
  }
}


const list = cva({
  base: { display: 'flex', flexDirection: 'column', gap: '0.5', listStyle: 'none', m: '0', p: '0', minW: '0' },
  variants: {
    empty: {
      true: {
        alignItems: 'center',
        justifyContent: 'center',
        minH: 'control.md',
        borderWidth: '1px',
        borderStyle: 'dashed',
        borderColor: 'border.default',
        borderRadius: 'sm',
        textStyle: 'ui.xs',
        color: 'fg.subtle',
      },
      false: {},
    },
    target: { true: {}, false: {} },
  },
  compoundVariants: [{ empty: true, target: true, css: { borderColor: 'accent.default', bg: 'accent.muted', color: 'fg.default' } }],
})
const item = cva({
  base: { position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '1', minW: '0', borderRadius: 'sm' },
  variants: { dragging: { true: { opacity: 0.4 }, false: {} }, grabbed: { true: { bg: 'bg.subtle' }, false: {} } },
})
const handle = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  w: '4',
  h: 'control.md',
  borderRadius: 'xs',
  color: 'fg.subtle',
  cursor: 'grab',
  touchAction: 'none',
  transitionProperty: 'color, background-color',
  transitionDuration: 'fast',
  _hover: { color: 'fg.default', bg: 'bg.hover' },
  _pressed: { color: 'accent.default', bg: 'accent.muted' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[-2px]' },
  _disabled: { opacity: 0.4, cursor: 'default' },
})
const body = css({ flex: '1', minW: '0' })
const indicator = css({ h: '0.5', my: '[-1px]', borderRadius: 'full', bg: 'accent.default', pointerEvents: 'none' })
const srOnly = css({ srOnly: true })
</script>

<template>
  <ul
    ref="listEl"
    :data-sortable-list="listId"
    :aria-label="ariaLabel"
    :class="list({ empty: items.length === 0, target: isTarget })"
  >
    <template v-for="(entry, index) in items" :key="keyOf(entry)">
      <li v-if="indicatorAt === index" role="presentation" data-part="indicator" :class="indicator" />
      <li
        data-sortable-item
        :data-sortable-key="keyOf(entry)"
        :data-flip-id="`sortable-${keyOf(entry)}`"
        :data-dragging="isDragging(index) || undefined"
        :class="item({ dragging: isDragging(index) && group.drag.value?.mode === 'pointer', grabbed: isDragging(index) && group.drag.value?.mode === 'keyboard' })"
      >
        <button v-if="showHandle" type="button" :class="handle" v-bind="handlePropsFor(entry, index)" @blur="onHandleBlur(index)">
          <Icon name="lucide:grip-vertical" size="14" />
        </button>
        <div :class="body">
          <slot
            :item="entry"
            :index="index"
            :handle-props="handlePropsFor(entry, index)"
            :dragging="isDragging(index) && group.drag.value?.mode === 'pointer'"
            :grabbed="isDragging(index) && group.drag.value?.mode === 'keyboard'"
          />
        </div>
      </li>
    </template>
    <li v-if="items.length > 0 && indicatorAt === items.length" role="presentation" data-part="indicator" :class="indicator" />
    <li v-if="items.length === 0" role="presentation" data-part="empty"><slot name="empty">{{ emptyText }}</slot></li>
    <li v-if="isRootList" role="presentation" :class="srOnly">
      <span :id="helpId">Press Space to grab, arrow keys to move, Space to drop, Escape to cancel. Option and arrow keys move one step.</span>
      <span aria-live="assertive" aria-atomic="true">{{ group.announcement.value }}</span>
    </li>
    <li v-else role="presentation" :class="srOnly"><span :id="helpId">Press Space to grab, arrow keys to move, Space to drop, Escape to cancel.</span></li>
  </ul>
</template>
