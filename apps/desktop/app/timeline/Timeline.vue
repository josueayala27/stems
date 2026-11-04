<script setup lang="ts">
// A DAW-style timeline: an overview of the whole song, a bar ruler, then rows (TimelineRow).
// Pinch or ⌘/Ctrl + scroll zooms at the pointer; sideways or Shift + scroll moves; + − 0 zoom
// from the keyboard; F toggles follow. Positions are song samples.
import type { TempoGrid } from '@stems/core'
import { css } from 'styled-system/css'
import { computed, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { IconButton } from '~/ui'
import TimelineOverview, { type OverviewBlock } from './TimelineOverview.vue'
import TimelineRuler from './TimelineRuler.vue'
import { provideTimeline } from './useTimeline'
import { follow, rulerTicks, wheel } from './view'

const props = withDefaults(
  defineProps<{
    length: number
    grid: TempoGrid | null
    /** Coloured blocks in the overview (usually the sections). */
    blocks?: OverviewBlock[]
    headerWidth?: number
    /** An edit cursor line (Arrange). */
    cursor?: number | null
    /** Show a play head; move it with `setPlayhead`. */
    playhead?: boolean
  }>(),
  { blocks: () => [], headerWidth: 200, cursor: null, playhead: false },
)
const emit = defineEmits<{ seek: [sample: number] }>()
defineSlots<{ default?: () => unknown; rulerHeader?: () => unknown }>()

const timeline = provideTimeline(toRef(props, 'length'), toRef(props, 'grid'))
const root = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const headLine = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null

function contentX(clientX: number): number {
  const rect = content.value?.getBoundingClientRect()
  return rect ? clientX - rect.left : 0
}

function onWheel(event: WheelEvent) {
  const next = wheel(timeline.view.value, event, contentX(event.clientX), props.length, timeline.width.value)
  if (!next) return
  event.preventDefault()
  // A hand move turns follow off, like a DAW; play-head follow comes back with F or the button.
  if (!event.ctrlKey && !event.metaKey) timeline.following.value = false
  timeline.setView(next)
}

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)
}

function onKeyDown(event: KeyboardEvent) {
  if (typing(event.target) || event.altKey || event.metaKey || event.ctrlKey) return
  const actions: Record<string, () => void> = {
    '=': () => timeline.zoom(1.5),
    '+': () => timeline.zoom(1.5),
    '-': () => timeline.zoom(1 / 1.5),
    '0': () => timeline.fit(),
    f: () => (timeline.following.value = !timeline.following.value),
  }
  const action = actions[event.key]
  if (action) {
    event.preventDefault()
    action()
  }
}

/** Move the play head line (call every animation frame). Turns the page while following. */
function setPlayhead(sample: number) {
  if (timeline.following.value) {
    const next = follow(timeline.view.value, sample, props.length, timeline.width.value)
    if (next !== timeline.view.value) timeline.setView(next)
  }
  const line = headLine.value
  if (!line) return
  const x = timeline.xAt(sample)
  line.style.display = x < 0 || x > timeline.width.value ? 'none' : 'block'
  line.style.transform = `translateX(${x}px)`
}
defineExpose({ setPlayhead, timeline })

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) timeline.width.value = Math.max(1, Math.round(entry.contentRect.width))
  })
  if (content.value) observer.observe(content.value)
  root.value?.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  root.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('keydown', onKeyDown)
})

/** Faint bar lines behind the rows. */
const barLines = computed(() =>
  props.grid ? rulerTicks(props.grid, timeline.view.value, timeline.width.value, props.length).filter((tick) => tick.kind === 'bar' && tick.label !== null) : [],
)
const cursorX = computed(() => (props.cursor === null ? null : timeline.xAt(props.cursor)))
const zoomLabel = computed(() => {
  const seconds = (timeline.end.value - timeline.view.value.start) / (props.grid?.sampleRate || 48_000)
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')} shown` : `${seconds.toFixed(1)} s shown`
})

const rootClass = css({ position: 'relative', display: 'flex', flexDirection: 'column', minH: '0', flex: '1' })
const top = css({ display: 'grid', flexShrink: '0', borderBottomWidth: '1px', borderColor: 'border.default', bg: 'bg.panel' })
const controls = css({ display: 'flex', alignItems: 'center', gap: '1', px: '2', borderRightWidth: '1px', borderColor: 'border.default' })
const zoomText = css({ textStyle: 'ui.xs', color: 'fg.subtle', ml: '1', whiteSpace: 'nowrap', overflow: 'hidden' })
const rulerHead = css({ display: 'flex', alignItems: 'center', px: '3', borderRightWidth: '1px', borderTopWidth: '1px', borderColor: 'border.default', textStyle: 'ui.label', color: 'fg.subtle', textTransform: 'uppercase' })
const rulerCell = css({ borderTopWidth: '1px', borderColor: 'border.default' })
const body = css({ position: 'relative', flex: '1', minH: '0', overflowY: 'auto', overflowX: 'hidden' })
const overlay = css({ position: 'absolute', top: '0', bottom: '0', right: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '[2]' })
const barLine = css({ position: 'absolute', top: '0', bottom: '0', w: '[1px]', bg: 'border.default', opacity: '0.6' })
const head = css({ position: 'absolute', top: '0', bottom: '0', left: '0', w: '[2px]', ml: '[-1px]', bg: 'accent.default', willChange: 'transform' })
const cursorLine = css({ position: 'absolute', top: '0', bottom: '0', w: '[2px]', ml: '[-1px]', bg: 'warning.default' })
</script>

<template>
  <div ref="root" :class="rootClass">
    <div :class="top" :style="{ gridTemplateColumns: `${headerWidth}px 1fr` }">
      <div :class="controls">
        <IconButton icon="lucide:zoom-out" label="Zoom out" shortcut="-" size="sm" @click="timeline.zoom(1 / 1.5)" />
        <IconButton icon="lucide:zoom-in" label="Zoom in" shortcut="=" size="sm" @click="timeline.zoom(1.5)" />
        <IconButton icon="lucide:maximize-2" label="Show the whole song" shortcut="0" size="sm" @click="timeline.fit()" />
        <IconButton
          v-if="playhead"
          icon="lucide:move-right"
          label="Follow the play head"
          shortcut="F"
          size="sm"
          :active="timeline.following.value"
          @click="timeline.following.value = !timeline.following.value"
        />
        <span :class="zoomText">{{ zoomLabel }}</span>
      </div>
      <TimelineOverview :blocks="blocks" />
      <div :class="rulerHead"><slot name="rulerHeader">Bars</slot></div>
      <div ref="content" :class="rulerCell">
        <TimelineRuler @seek="(sample: number) => emit('seek', sample)" />
      </div>
    </div>
    <div :class="body">
      <slot />
      <div :class="overlay" :style="{ left: `${headerWidth}px` }" aria-hidden="true">
        <span v-for="tick in barLines" :key="tick.sample" :class="barLine" :style="{ left: `${tick.x}px` }" />
        <span v-if="cursorX !== null && cursorX >= 0 && cursorX <= timeline.width.value" :class="cursorLine" :style="{ left: `${cursorX}px` }" />
        <span v-if="playhead" ref="headLine" :class="head" />
      </div>
    </div>
  </div>
</template>
