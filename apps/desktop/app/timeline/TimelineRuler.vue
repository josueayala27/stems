<script setup lang="ts">
// Bar numbers, bar and beat lines. Press and drag to scrub: emits `seek` with song samples.
import { css } from 'styled-system/css'
import { computed } from 'vue'
import { useTimeline } from './useTimeline'
import { rulerTicks } from './view'

const emit = defineEmits<{ seek: [sample: number] }>()
const timeline = useTimeline()
const ticks = computed(() => (timeline.grid.value ? rulerTicks(timeline.grid.value, timeline.view.value, timeline.width.value, timeline.length.value) : []))

function at(event: PointerEvent): number {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = Math.min(Math.max(0, event.clientX - rect.left), rect.width)
  return Math.min(timeline.length.value, Math.max(0, Math.round(timeline.sampleAt(x))))
}
function down(event: PointerEvent) {
  if (event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('seek', at(event))
}
function move(event: PointerEvent) {
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) emit('seek', at(event))
}

const ruler = css({ position: 'relative', h: '[26px]', cursor: 'text', overflow: 'hidden', userSelect: 'none', touchAction: 'none' })
const barTick = css({ position: 'absolute', bottom: '0', h: '[10px]', w: '[1px]', bg: 'border.strong' })
const labelled = css({ h: 'full' })
const beatTick = css({ position: 'absolute', bottom: '0', h: '[5px]', w: '[1px]', bg: 'border.default' })
const label = css({ position: 'absolute', top: '1', pl: '1', textStyle: 'ui.xs', fontFamily: 'mono', color: 'fg.muted', whiteSpace: 'nowrap' })
</script>

<template>
  <div :class="ruler" role="slider" aria-label="Song position: press and drag to move the play head" aria-valuemin="0" :aria-valuemax="timeline.length.value" @pointerdown="down" @pointermove="move">
    <template v-for="tick in ticks" :key="`${tick.kind}${tick.sample}`">
      <span :class="[tick.kind === 'bar' ? barTick : beatTick, tick.label !== null && labelled]" :style="{ left: `${tick.x}px` }" />
      <span v-if="tick.label !== null" :class="label" :style="{ left: `${tick.x}px` }">{{ tick.label }}</span>
    </template>
  </div>
</template>
