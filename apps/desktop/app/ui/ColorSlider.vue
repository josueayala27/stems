<script setup lang="ts">
import { css } from 'styled-system/css'
import { usePointerDrag } from './composables/usePointerDrag'
import { clamp } from './lib/number'

// A 0..1 colour channel track (hue or alpha); the caller paints the gradient.
withDefaults(defineProps<{ background: string; label: string; checkered?: boolean; valueText?: string }>(), {
  checkered: false,
  valueText: undefined,
})
const model = defineModel<number>({ required: true })
const emit = defineEmits<{ scrubStart: []; scrubEnd: [] }>()

const { onPointerDown } = usePointerDrag({
  onStart: () => emit('scrubStart'),
  onMove: ({ x }) => (model.value = x),
  onEnd: () => emit('scrubEnd'),
})

function onKeydown(event: KeyboardEvent): void {
  const delta = event.shiftKey ? 0.1 : 0.01
  const next = { ArrowLeft: -delta, ArrowDown: -delta, ArrowRight: delta, ArrowUp: delta }[event.key]
  if (next === undefined) return
  event.preventDefault()
  model.value = clamp(model.value + next, 0, 1)
}

const track = css({
  position: 'relative',
  w: 'full',
  h: '3',
  borderRadius: 'full',
  cursor: 'pointer',
  touchAction: 'none',
  outline: 'none',
  '--thumb': 'token(sizes.3)',
  _focusVisible: { '& [data-part=thumb]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default' } },
})
const checker = css({
  backgroundImage:
    'conic-gradient(token(colors.fg.subtle) 25%, token(colors.bg.active) 0 50%, token(colors.fg.subtle) 0 75%, token(colors.bg.active) 0)',
  backgroundSize: '[8px 8px]',
})
const paint = css({ position: 'absolute', inset: '0', borderRadius: 'full' })
const thumb = css({
  position: 'absolute',
  top: '[50%]',
  w: '3',
  h: '3',
  borderRadius: 'full',
  borderWidth: '2px',
  borderColor: 'fg.onAccent',
  boxShadow: 'sm',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
})
</script>

<template>
  <div
    role="slider"
    tabindex="0"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(model * 100)"
    :aria-valuetext="valueText"
    :class="[track, checkered && checker]"
    @pointerdown="onPointerDown"
    @keydown="onKeydown"
  >
    <span :class="paint" :style="{ background }" />
    <span data-part="thumb" :class="thumb" :style="{ left: `calc(${model} * (100% - var(--thumb)) + var(--thumb) / 2)` }" />
  </div>
</template>
