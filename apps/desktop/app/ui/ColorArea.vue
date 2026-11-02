<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed } from 'vue'
import { usePointerDrag } from './composables/usePointerDrag'
import { clamp } from './lib/number'

// Saturation (x) / value (y) plane for one hue.
const props = defineProps<{ hue: number }>()
const saturation = defineModel<number>('saturation', { required: true })
const brightness = defineModel<number>('brightness', { required: true })
const emit = defineEmits<{ scrubStart: []; scrubEnd: [] }>()

const { onPointerDown } = usePointerDrag({
  onStart: () => emit('scrubStart'),
  onMove: ({ x, y }) => {
    saturation.value = x
    brightness.value = 1 - y
  },
  onEnd: () => emit('scrubEnd'),
})

function onKeydown(event: KeyboardEvent): void {
  const delta = event.shiftKey ? 0.1 : 0.01
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-delta, 0],
    ArrowRight: [delta, 0],
    ArrowUp: [0, delta],
    ArrowDown: [0, -delta],
  }
  const move = moves[event.key]
  if (!move) return
  event.preventDefault()
  saturation.value = clamp(saturation.value + move[0], 0, 1)
  brightness.value = clamp(brightness.value + move[1], 0, 1)
}

const hueColor = computed(() => `hsl(${props.hue} 100% 50%)`)
const valueText = computed(() => `Saturation ${Math.round(saturation.value * 100)}%, brightness ${Math.round(brightness.value * 100)}%`)

const area = css({
  position: 'relative',
  w: 'full',
  aspectRatio: 'landscape',
  borderRadius: 'sm',
  cursor: 'crosshair',
  touchAction: 'none',
  outline: 'none',
  backgroundImage: 'linear-gradient(to top, black, transparent), linear-gradient(to right, white, transparent)',
  // The thumb overhangs the edges by half its size; widen the hit zone so grabbing it there still drags.
  _before: { content: '""', position: 'absolute', inset: '[-6px]' },
  _focusVisible: { '& [data-part=thumb]': { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default' } },
})
const thumb = css({
  position: 'absolute',
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
    aria-label="Saturation and brightness"
    :aria-valuetext="valueText"
    :class="area"
    :style="{ backgroundColor: hueColor }"
    @pointerdown="onPointerDown"
    @keydown="onKeydown"
  >
    <span data-part="thumb" :class="thumb" :style="{ left: `${saturation * 100}%`, top: `${(1 - brightness) * 100}%` }" />
  </div>
</template>
