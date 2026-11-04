<script setup lang="ts">
// A vertical bar on a panel's edge: drag to resize, double-click to reset, arrows from the keyboard.
import { css } from 'styled-system/css'

const props = withDefaults(defineProps<{ width: number; side?: 'right' | 'left'; label?: string }>(), { side: 'right', label: 'Resize panel' })
const emit = defineEmits<{ resize: [width: number]; reset: [] }>()

let origin: { x: number; width: number } | null = null
function down(event: PointerEvent) {
  if (event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  origin = { x: event.clientX, width: props.width }
}
function move(event: PointerEvent) {
  if (!origin) return
  const delta = event.clientX - origin.x
  emit('resize', origin.width + (props.side === 'right' ? delta : -delta))
}
function key(event: KeyboardEvent) {
  const step = event.shiftKey ? 40 : 10
  const grow = props.side === 'right' ? 'ArrowRight' : 'ArrowLeft'
  const shrink = props.side === 'right' ? 'ArrowLeft' : 'ArrowRight'
  if (event.key === grow) emit('resize', props.width + step)
  else if (event.key === shrink) emit('resize', props.width - step)
  else return
  event.preventDefault()
}

const handle = css({
  position: 'absolute',
  top: '0',
  bottom: '0',
  w: '[6px]',
  cursor: 'col-resize',
  zIndex: '[3]',
  touchAction: 'none',
  _hover: { bg: 'accent.default', opacity: '0.5' },
  _focusVisible: { bg: 'accent.default', outline: 'none' },
})
</script>

<template>
  <div
    :class="handle"
    :style="side === 'right' ? { right: '-3px' } : { left: '-3px' }"
    role="separator"
    aria-orientation="vertical"
    :aria-valuenow="width"
    :aria-label="label"
    tabindex="0"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="origin = null"
    @dblclick="emit('reset')"
    @keydown="key"
  />
</template>
