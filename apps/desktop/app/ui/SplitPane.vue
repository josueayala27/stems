<script setup lang="ts">
import { css, cva } from 'styled-system/css'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue'
import { normalizeSizes, pairBounds, resizePanes } from './lib/splitPane'
import type { SplitPaneItem } from './types'

/**
 * Resizable panes with separators between them.
 *
 * `sizes` (v-model:sizes) holds one percentage per pane: its share of the space
 * the panes split (the container minus the separators). The values add up to 100.
 * Missing or invalid entries fall back to an equal split. Percentages render the
 * same on the server and the client, so there is no layout jump on hydrate.
 * Per-pane `min`/`max` are pixels: CSS applies them at render time, and drags
 * and keys clamp to them.
 *
 * Each pane renders the slot named after its `id`, with `{ size }` (percent).
 * Separators take focus: arrow keys move them 8px (Shift: 32px), Home and End
 * shrink or grow the pane before the separator to its limit.
 */
const props = withDefaults(
  defineProps<{
    panes: readonly SplitPaneItem[]
    /** `horizontal`: panes side by side. `vertical`: panes stacked. */
    direction?: 'horizontal' | 'vertical'
  }>(),
  { direction: 'horizontal' },
)

const model = defineModel<number[]>('sizes')

const emit = defineEmits<{
  /** A drag ended or a key moved a separator. Carries the new sizes. */
  'resize-end': [sizes: number[]]
}>()

defineSlots<Record<string, (props: { size: number }) => unknown>>()

const KEY_STEP = 8
const KEY_STEP_LARGE = 32

const horizontal = computed(() => props.direction === 'horizontal')
const sizes = computed(() => normalizeSizes(model.value, props.panes.length))
const limits = computed(() => props.panes.map(({ min, max }) => ({ min, max })))

const baseId = useId()
function paneId(index: number): string {
  return `${baseId}-pane-${index}`
}

const rootEl = ref<HTMLElement | null>(null)
const paneEls: HTMLElement[] = []
function setPaneEl(index: number, el: unknown): void {
  if (el instanceof HTMLElement) paneEls[index] = el
}

/** Pixels the panes share; 0 until measured on the client. */
const totalPx = ref(0)

function measure(): number[] {
  const pixels = props.panes.map((_, i) => {
    const rect = paneEls[i]?.getBoundingClientRect()
    return rect ? (horizontal.value ? rect.width : rect.height) : 0
  })
  totalPx.value = pixels.reduce((sum, size) => sum + size, 0)
  return pixels
}

function commit(next: number[]): boolean {
  if (next.every((size, i) => size === sizes.value[i])) return false
  model.value = next
  return true
}

function moveTo(pixels: number[], index: number, target: number): boolean {
  if (totalPx.value <= 0) return false
  return commit(resizePanes(pixels, limits.value, index, target))
}

// aria-valuenow/min/max are the pane before the separator, in percent.
function valueMin(index: number): number {
  const pair = totalPx.value * ((sizes.value[index]! + sizes.value[index + 1]!) / 100)
  if (totalPx.value <= 0) return 0
  return Math.round((pairBounds(pair, limits.value[index]!, limits.value[index + 1]!).lo / totalPx.value) * 100)
}
function valueMax(index: number): number {
  const pair = totalPx.value * ((sizes.value[index]! + sizes.value[index + 1]!) / 100)
  if (totalPx.value <= 0) return 100
  return Math.round((pairBounds(pair, limits.value[index]!, limits.value[index + 1]!).hi / totalPx.value) * 100)
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
  const back = horizontal.value ? 'ArrowLeft' : 'ArrowUp'
  const forward = horizontal.value ? 'ArrowRight' : 'ArrowDown'
  const pixels = measure()
  const current = pixels[index]!
  let target: number
  switch (event.key) {
    case back:
      target = current - step
      break
    case forward:
      target = current + step
      break
    case 'Home':
      target = -Infinity
      break
    case 'End':
      target = Infinity
      break
    default:
      return
  }
  event.preventDefault()
  if (moveTo(pixels, index, target)) emit('resize-end', sizes.value)
}

interface Drag {
  index: number
  pointerId: number
  start: number
  pixels: number[]
}
const drag = shallowRef<Drag | null>(null)

function coord(event: PointerEvent): number {
  return horizontal.value ? event.clientX : event.clientY
}

function onPointerDown(event: PointerEvent, index: number): void {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
  event.preventDefault()
  event.currentTarget.focus({ preventScroll: true })
  event.currentTarget.setPointerCapture?.(event.pointerId)
  drag.value = { index, pointerId: event.pointerId, start: coord(event), pixels: measure() }
}

function onPointerMove(event: PointerEvent): void {
  const active = drag.value
  if (!active || event.pointerId !== active.pointerId) return
  moveTo(active.pixels, active.index, active.pixels[active.index]! + coord(event) - active.start)
}

function onPointerEnd(event: PointerEvent): void {
  const active = drag.value
  if (!active || event.pointerId !== active.pointerId) return
  drag.value = null
  emit('resize-end', sizes.value)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'undefined' || !rootEl.value) return
  observer = new ResizeObserver(() => measure())
  observer.observe(rootEl.value)
})
onBeforeUnmount(() => observer?.disconnect())

function paneStyle(index: number): Record<string, string | number | undefined> {
  const { min, max } = props.panes[index]!
  const px = (value: number | undefined) => (value === undefined ? undefined : `${value}px`)
  return horizontal.value
    ? { flexGrow: sizes.value[index], minWidth: px(min), maxWidth: px(max) }
    : { flexGrow: sizes.value[index], minHeight: px(min), maxHeight: px(max) }
}

function separatorLabel(pane: SplitPaneItem): string {
  return `Resize ${pane.label ?? pane.id}`
}

const root = cva({
  base: { display: 'flex', w: 'full', h: 'full', minW: '0', minH: '0', overflow: 'hidden' },
  variants: {
    direction: { horizontal: { flexDirection: 'row' }, vertical: { flexDirection: 'column' } },
    dragging: { true: { userSelect: 'none' }, false: {} },
  },
})
const pane = css({ position: 'relative', flexShrink: 1, flexBasis: '0', minW: '0', minH: '0', overflow: 'hidden' })
const separator = cva({
  base: {
    position: 'relative',
    flexShrink: 0,
    bg: 'border.default',
    outline: 'none',
    touchAction: 'none',
    transitionProperty: 'background-color',
    transitionDuration: 'fast',
    transitionTimingFunction: 'standard',
    // A wider invisible hit area than the 1px line.
    _before: { content: '""', position: 'absolute', zIndex: 'overlay' },
    _hover: { bg: 'accent.default' },
    _focusVisible: { bg: 'accent.default', boxShadow: '[0 0 0 1px token(colors.accent.default)]' },
    '&[data-dragging=true]': { bg: 'accent.default' },
  },
  variants: {
    direction: {
      horizontal: { w: '[1px]', alignSelf: 'stretch', cursor: 'col-resize', _before: { top: '0', bottom: '0', left: '-1', right: '-1' } },
      vertical: { h: '[1px]', alignSelf: 'stretch', cursor: 'row-resize', _before: { left: '0', right: '0', top: '-1', bottom: '-1' } },
    },
  },
})
</script>

<template>
  <div ref="rootEl" :class="root({ direction, dragging: drag !== null })" :data-direction="direction">
    <template v-for="(item, index) in panes" :key="item.id">
      <div :id="paneId(index)" :ref="(el) => setPaneEl(index, el)" data-part="pane" :data-pane="item.id" :class="pane" :style="paneStyle(index)">
        <slot :name="item.id" :size="sizes[index]!" />
      </div>
      <div
        v-if="index < panes.length - 1"
        role="separator"
        tabindex="0"
        data-part="separator"
        :aria-orientation="horizontal ? 'vertical' : 'horizontal'"
        :aria-valuenow="Math.round(sizes[index]!)"
        :aria-valuemin="valueMin(index)"
        :aria-valuemax="valueMax(index)"
        :aria-controls="paneId(index)"
        :aria-label="separatorLabel(item)"
        :data-dragging="drag?.index === index"
        :class="separator({ direction })"
        @keydown="onKeydown($event, index)"
        @pointerdown="onPointerDown($event, index)"
        @pointermove="onPointerMove"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
      />
    </template>
  </div>
</template>
