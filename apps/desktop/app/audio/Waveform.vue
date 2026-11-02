<script setup lang="ts">
// Draws a track from its peak file on a canvas. The UI never decodes audio.
import { css } from 'styled-system/css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { waveformColumns, type Peaks } from './peaks'

const props = withDefaults(
  defineProps<{
    peaks: Peaks | null
    /** A `track.*` colour token name, e.g. `red`. */
    color?: string
    /** Visible range in frames. Defaults to the whole track. */
    start?: number
    end?: number
    height?: number
    ariaLabel?: string
  }>(),
  { color: 'blue', start: 0, end: undefined, height: 48, ariaLabel: 'Waveform' },
)

const canvas = ref<HTMLCanvasElement | null>(null)
let observer: ResizeObserver | null = null
let frame = 0

function draw() {
  frame = 0
  const element = canvas.value
  if (!element) return
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(element.clientWidth * ratio))
  const height = Math.max(1, Math.round(props.height * ratio))
  if (element.width !== width) element.width = width
  if (element.height !== height) element.height = height
  const context = element.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, width, height)
  const peaks = props.peaks
  if (!peaks) return
  // The canvas inherits the token colour through `color`; read it resolved.
  context.fillStyle = getComputedStyle(element).color
  const end = props.end ?? peaks.frames
  const columns = waveformColumns(peaks, props.start, end, width)
  const middle = height / 2
  for (let x = 0; x < width; x++) {
    const top = middle - columns[x * 2 + 1]! * middle
    const bottom = middle - columns[x * 2]! * middle
    context.fillRect(x, top, 1, Math.max(1, bottom - top))
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(draw)
}

onMounted(() => {
  observer = new ResizeObserver(schedule)
  if (canvas.value) observer.observe(canvas.value)
  schedule()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame) cancelAnimationFrame(frame)
})

watch(() => [props.peaks, props.start, props.end, props.color, props.height], schedule)

const canvasClass = css({ display: 'block', w: 'full' })
</script>

<template>
  <canvas
    ref="canvas"
    :class="canvasClass"
    :style="{ height: `${height}px`, color: `var(--colors-track-${color})` }"
    role="img"
    :aria-label="ariaLabel"
  />
</template>
