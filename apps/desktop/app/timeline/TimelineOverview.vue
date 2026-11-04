<script setup lang="ts">
// The whole song in one strip, with a box for the part the timeline shows. Drag the box, or
// press anywhere to centre the view there.
import { css } from 'styled-system/css'
import { computed, ref } from 'vue'
import { useTimeline } from './useTimeline'
import { centreOn, scrollBy } from './view'

export interface OverviewBlock {
  start: number
  end: number
  color: string
  name: string
}

defineProps<{ blocks: OverviewBlock[] }>()
const timeline = useTimeline()
const strip = ref<HTMLElement | null>(null)
const percent = (sample: number) => (timeline.length.value > 0 ? (sample / timeline.length.value) * 100 : 0)
const box = computed(() => ({ left: `${percent(timeline.view.value.start)}%`, width: `${Math.max(0.5, percent(timeline.end.value - timeline.view.value.start))}%` }))

let lastX: number | null = null
function down(event: PointerEvent) {
  if (event.button !== 0 || !strip.value) return
  strip.value.setPointerCapture(event.pointerId)
  const rect = strip.value.getBoundingClientRect()
  const sample = ((event.clientX - rect.left) / rect.width) * timeline.length.value
  const inside = sample >= timeline.view.value.start && sample <= timeline.end.value
  if (!inside) timeline.setView(centreOn(timeline.view.value, sample, timeline.length.value, timeline.width.value))
  timeline.following.value = false
  lastX = event.clientX
}
function move(event: PointerEvent) {
  if (lastX === null || !strip.value) return
  const rect = strip.value.getBoundingClientRect()
  const samples = ((event.clientX - lastX) / rect.width) * timeline.length.value
  lastX = event.clientX
  timeline.setView(scrollBy(timeline.view.value, samples / timeline.view.value.scale, timeline.length.value, timeline.width.value))
}
function up() {
  lastX = null
}

const stripClass = css({ position: 'relative', h: '[22px]', my: '1', mx: '2', borderRadius: 'sm', bg: 'bg.input', overflow: 'hidden', cursor: 'grab', userSelect: 'none', touchAction: 'none' })
const block = css({ position: 'absolute', top: '0', bottom: '0', opacity: '0.55', borderRightWidth: '1px', borderColor: 'bg.canvas' })
const viewBox = css({ position: 'absolute', top: '0', bottom: '0', borderWidth: '2px', borderColor: 'accent.default', borderRadius: 'sm', bg: 'accent.muted' })
</script>

<template>
  <div ref="strip" :class="stripClass" aria-label="Song overview: drag to move the view" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <span
      v-for="item in blocks"
      :key="`${item.start}`"
      :class="block"
      :title="item.name"
      :style="{ left: `${percent(item.start)}%`, width: `${percent(item.end - item.start)}%`, background: `var(--colors-track-${item.color})` }"
    />
    <span :class="viewBox" :style="box" />
  </div>
</template>
