<script setup lang="ts">
// Markers as pins. When editable, drag a pin to move it: `move` gets the raw sample.
import { css } from 'styled-system/css'
import { computed } from 'vue'
import { useTimeline } from './useTimeline'

export interface LaneMarker {
  id: string
  name: string
  sample: number
}

const props = withDefaults(defineProps<{ markers: LaneMarker[]; editable?: boolean }>(), { editable: false })
const emit = defineEmits<{ move: [id: string, sample: number, free: boolean]; pick: [id: string]; background: [sample: number] }>()
const timeline = useTimeline()
const visible = computed(() => props.markers.map((marker) => ({ marker, x: timeline.xAt(marker.sample) })).filter((item) => item.x >= -80 && item.x <= timeline.width.value))

let dragging: { id: string; lane: HTMLElement } | null = null
function grab(event: PointerEvent, id: string) {
  if (!props.editable || event.button !== 0) return
  event.stopPropagation()
  const lane = (event.currentTarget as HTMLElement).closest('[data-lane]') as HTMLElement | null
  if (!lane) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging = { id, lane }
}
function drag(event: PointerEvent) {
  if (!dragging) return
  const rect = dragging.lane.getBoundingClientRect()
  emit('move', dragging.id, Math.max(0, timeline.sampleAt(event.clientX - rect.left)), event.altKey)
}
function background(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('background', Math.max(0, timeline.sampleAt(event.clientX - rect.left)))
}

const lane = css({ position: 'absolute', inset: '0', cursor: 'pointer' })
const pin = css({ position: 'absolute', top: '0', bottom: '0', display: 'flex', alignItems: 'flex-start', touchAction: 'none' })
const line = css({ w: '[2px]', h: 'full', bg: 'warning.default' })
const flag = css({ mt: '1', px: '1.5', borderRadius: 'xs', bg: 'warning.default', color: 'fg.onAccent', textStyle: 'ui.xs', whiteSpace: 'nowrap', cursor: 'grab' })
</script>

<template>
  <div :class="lane" data-lane @click.self="background">
    <span
      v-for="item in visible"
      :key="item.marker.id"
      :class="pin"
      :style="{ left: `${item.x - 1}px` }"
      @pointerdown="grab($event, item.marker.id)"
      @pointermove="drag"
      @pointerup="dragging = null"
      @click.stop="emit('pick', item.marker.id)"
    >
      <span :class="line" />
      <span :class="flag">{{ item.marker.name || 'Marker' }}</span>
    </span>
  </div>
</template>
