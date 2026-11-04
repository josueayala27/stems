<script setup lang="ts">
// Sections as coloured blocks on the timeline. Click a block to pick it. When editable, drag a
// block's edges to resize it: `resize` gets the raw sample, the page snaps it.
import { css } from 'styled-system/css'
import { computed } from 'vue'
import { useTimeline } from './useTimeline'

export interface LaneSection {
  id: string
  name: string
  start: number
  end: number
  color: string
}

const props = withDefaults(defineProps<{ sections: LaneSection[]; editable?: boolean; current?: number }>(), { editable: false, current: -1 })
const emit = defineEmits<{ pick: [index: number]; resize: [id: string, edge: 'start' | 'end', sample: number, free: boolean]; background: [sample: number] }>()
const timeline = useTimeline()

const visible = computed(() =>
  props.sections
    .map((section, index) => ({ section, index, left: timeline.xAt(section.start), right: timeline.xAt(section.end) }))
    .filter((item) => item.right >= 0 && item.left <= timeline.width.value),
)

let dragging: { id: string; edge: 'start' | 'end'; lane: HTMLElement } | null = null
function grab(event: PointerEvent, id: string, edge: 'start' | 'end') {
  if (event.button !== 0) return
  event.stopPropagation()
  const lane = (event.currentTarget as HTMLElement).closest('[data-lane]') as HTMLElement | null
  if (!lane) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging = { id, edge, lane }
}
function drag(event: PointerEvent) {
  if (!dragging) return
  const rect = dragging.lane.getBoundingClientRect()
  emit('resize', dragging.id, dragging.edge, Math.max(0, timeline.sampleAt(event.clientX - rect.left)), event.altKey)
}
function drop() {
  dragging = null
}
function background(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('background', Math.max(0, timeline.sampleAt(event.clientX - rect.left)))
}

const lane = css({ position: 'absolute', inset: '0', cursor: 'pointer' })
const block = css({
  position: 'absolute',
  top: '1',
  bottom: '1',
  display: 'flex',
  alignItems: 'center',
  px: '2',
  borderRadius: 'sm',
  textStyle: 'ui.xs',
  fontWeight: 'medium',
  color: 'fg.default',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  borderWidth: '1px',
  borderColor: 'transparent',
  _hover: { borderColor: 'fg.default' },
})
const currentBlock = css({ borderColor: 'fg.default', boxShadow: '[inset 0 -3px 0 var(--colors-fg-default)]' })
const edge = css({ position: 'absolute', top: '0', bottom: '0', w: '[8px]', cursor: 'ew-resize', zIndex: '[1]', _hover: { bg: 'fg.default', opacity: '0.4' } })
</script>

<template>
  <div :class="lane" data-lane @click.self="background">
    <span
      v-for="item in visible"
      :key="item.section.id"
      :class="[block, item.index === current && currentBlock]"
      :style="{ left: `${item.left}px`, width: `${Math.max(2, item.right - item.left)}px`, background: `var(--colors-track-${item.section.color})` }"
      :title="item.section.name"
      role="button"
      tabindex="-1"
      @click.stop="emit('pick', item.index)"
    >
      {{ item.section.name }}
      <template v-if="editable">
        <span :class="edge" :style="{ left: '0' }" @pointerdown="grab($event, item.section.id, 'start')" @pointermove="drag" @pointerup="drop" @click.stop />
        <span :class="edge" :style="{ right: '0' }" @pointerdown="grab($event, item.section.id, 'end')" @pointermove="drag" @pointerup="drop" @click.stop />
      </template>
    </span>
  </div>
</template>
