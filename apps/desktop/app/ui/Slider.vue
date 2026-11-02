<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed } from 'vue'
import { usePointerDrag } from './composables/usePointerDrag'
import { ratioFromValue, valueFromRatio } from './lib/geometry'
import { clamp, decimalsOf, roundTo } from './lib/number'

const props = withDefaults(
  defineProps<{ min?: number; max?: number; step?: number; disabled?: boolean; ariaLabel?: string; valueText?: string }>(),
  { min: 0, max: 100, step: 1, disabled: false, ariaLabel: undefined, valueText: undefined },
)

const model = defineModel<number>({ default: 0 })
const emit = defineEmits<{ scrubStart: []; scrubEnd: [] }>()

const ratio = computed(() => ratioFromValue(model.value, props.min, props.max))
// Keep the thumb inside the track: its centre travels from half a thumb in to half a thumb short of the end.
const position = computed(() => `calc(${ratio.value} * (100% - var(--thumb)) + var(--thumb) / 2)`)

function set(value: number): void {
  const next = roundTo(clamp(value, props.min, props.max), decimalsOf(props.step))
  if (next !== model.value) model.value = next
}

const { dragging, onPointerDown } = usePointerDrag({
  onStart: () => emit('scrubStart'),
  onMove: ({ x }) => set(valueFromRatio(x, props.min, props.max, props.step)),
  onEnd: () => emit('scrubEnd'),
})

function onKeydown(event: KeyboardEvent): void {
  const big = (props.max - props.min) / 10
  const keys: Record<string, number> = {
    ArrowRight: model.value + props.step * (event.shiftKey ? 10 : 1),
    ArrowUp: model.value + props.step * (event.shiftKey ? 10 : 1),
    ArrowLeft: model.value - props.step * (event.shiftKey ? 10 : 1),
    ArrowDown: model.value - props.step * (event.shiftKey ? 10 : 1),
    PageUp: model.value + big,
    PageDown: model.value - big,
    Home: props.min,
    End: props.max,
  }
  const next = keys[event.key]
  if (next === undefined) return
  event.preventDefault()
  set(next)
}

const root = css({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  w: 'full',
  h: 'control.md',
  cursor: 'pointer',
  touchAction: 'none',
  outline: 'none',
  '--thumb': 'token(sizes.3)',
  _focusVisible: { outline: 'none', '& [data-part=thumb]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[1px]' } },
  '&[aria-disabled=true]': { opacity: 0.4, pointerEvents: 'none' },
  _hover: { '& [data-part=thumb]': { transform: 'translate(-50%, -50%) scale(1.15)' } },
})
const track = css({ position: 'relative', w: 'full', h: '1', borderRadius: 'full', bg: 'bg.active', overflow: 'hidden' })
const fill = css({ position: 'absolute', insetY: '0', left: '0', bg: 'accent.default', borderRadius: 'full' })
const thumb = css({
  position: 'absolute',
  top: '[50%]',
  w: '3',
  h: '3',
  borderRadius: 'full',
  bg: 'fg.onAccent',
  boxShadow: 'sm',
  transform: 'translate(-50%, -50%)',
  transitionProperty: 'transform',
  transitionDuration: 'fast',
  pointerEvents: 'none',
})
const thumbActive = css({ transform: 'translate(-50%, -50%) scale(1.15)' })
</script>

<template>
  <div
    role="slider"
    :tabindex="disabled ? -1 : 0"
    :aria-label="ariaLabel"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="model"
    :aria-valuetext="valueText"
    :aria-disabled="disabled || undefined"
    :class="root"
    @pointerdown="onPointerDown"
    @keydown="onKeydown"
  >
    <div :class="track">
      <div :class="fill" :style="{ width: position }" />
    </div>
    <div data-part="thumb" :class="[thumb, dragging && thumbActive]" :style="{ left: position }" />
  </div>
</template>
