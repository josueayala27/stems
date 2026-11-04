<script setup lang="ts">
// Play's timeline: overview, bar ruler, the sections and one lane per track, zoomable and
// scrollable like a DAW. Click a section to jump there on the quantize boundary; press the ruler
// or a lane to move the play head. Timeline positions are song samples; the engine works in
// device frames, so positions convert both ways.
import { css } from 'styled-system/css'
import { computed, ref, shallowRef, watch } from 'vue'
import type { Peaks } from '~/audio/peaks'
import Waveform from '~/audio/Waveform.vue'
import { library } from '~/data/library'
import { onPlayhead, usePlayer } from '~/engine/player'
import { fromEngine, toEngine } from '~/engine/songDoc'
import SectionLane, { type LaneSection } from '~/timeline/SectionLane.vue'
import Timeline from '~/timeline/Timeline.vue'
import TimelineRow from '~/timeline/TimelineRow.vue'
import { useTimelineRange } from '~/timeline/range'
import { gridFor } from '../arrange/arrangement'

const HEADER = 200
const player = usePlayer()
const song = computed(() => player.song.value)
const grid = computed(() => (song.value ? gridFor(song.value) : null))
const length = computed(() => song.value?.durationSamples ?? 0)
const timeline = ref<InstanceType<typeof Timeline> | null>(null)
const range = useTimelineRange(timeline)

const sections = computed<LaneSection[]>(() =>
  [...(song.value?.sections ?? [])]
    .sort((a, b) => a.startSample - b.startSample)
    .map((section) => ({ id: section.id, name: section.name, start: section.startSample, end: section.endSample, color: section.color })),
)

onPlayhead((frames) => {
  const current = song.value
  if (current && timeline.value) timeline.value.setPlayhead(fromEngine(frames, current.sampleRate, player.sampleRate.value))
})

const peaks = shallowRef<Record<string, Peaks | null>>({})
const cache = new Map<string, Peaks | null>()
watch(
  song,
  async (current) => {
    if (!current) return
    const loaded: Record<string, Peaks | null> = {}
    await Promise.all(
      current.tracks.map(async (track) => {
        if (!cache.has(track.hash)) cache.set(track.hash, await library.peaks(track.hash).catch(() => null))
        loaded[track.id] = cache.get(track.hash) ?? null
      }),
    )
    peaks.value = loaded
  },
  { immediate: true },
)

function seek(sample: number) {
  const current = song.value
  if (!current || player.locked.value) return
  void player.seek(toEngine(sample, current.sampleRate, player.sampleRate.value))
}

function seekFromLane(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const view = timeline.value?.timeline
  if (view) seek(Math.max(0, view.sampleAt(event.clientX - rect.left)))
}

const name = css({ flex: '1', minW: '0', textStyle: 'ui.sm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const swatch = css({ w: '1', alignSelf: 'stretch', my: '2', borderRadius: 'full', flexShrink: '0' })
const toggle = css({
  display: 'grid',
  placeItems: 'center',
  w: '[28px]',
  h: '[28px]',
  borderRadius: 'sm',
  borderWidth: '1px',
  borderColor: 'border.default',
  textStyle: 'ui.xs',
  fontWeight: 'bold',
  color: 'fg.muted',
  _hover: { bg: 'bg.hover' },
  _disabled: { opacity: '0.4' },
  '&[aria-pressed=true][data-kind=mute]': { bg: 'warning.default', color: 'fg.onAccent', borderColor: 'warning.default' },
  '&[aria-pressed=true][data-kind=solo]': { bg: 'accent.default', color: 'fg.onAccent', borderColor: 'accent.default' },
})
const lane = css({ position: 'absolute', inset: '0', cursor: 'pointer' })
const label = css({ textStyle: 'ui.label', color: 'fg.subtle', textTransform: 'uppercase' })
</script>

<template>
  <Timeline v-if="song" ref="timeline" :length="length" :grid="grid" :blocks="sections" :header-width="HEADER" playhead @seek="seek">
    <template #rulerHeader>Tracks</template>
    <TimelineRow :height="36" :header-width="HEADER" label="Sections">
      <template #header><span :class="label">Sections</span></template>
      <SectionLane :sections="sections" :current="player.sectionIndex.value" @pick="(index: number) => player.jumpToSection(index)" @background="seek" />
    </TimelineRow>
    <TimelineRow v-for="(track, at) in song.tracks" :key="track.id" :height="56" :header-width="HEADER" :label="`${track.name} lane`">
      <template #header>
        <span :class="swatch" :style="{ background: `var(--colors-track-${track.color})` }" aria-hidden="true" />
        <span :class="name" :title="track.name">{{ track.name }}</span>
        <button
          type="button"
          :class="toggle"
          data-kind="mute"
          :aria-pressed="player.muted.value[at] ?? false"
          :aria-label="`Mute ${track.name}`"
          :disabled="player.locked.value"
          @click="player.setMute(at, !player.muted.value[at])"
        >M</button>
        <button
          type="button"
          :class="toggle"
          data-kind="solo"
          :aria-pressed="player.soloed.value[at] ?? false"
          :aria-label="`Solo ${track.name}`"
          :disabled="player.locked.value"
          @click="player.setSolo(at, !player.soloed.value[at])"
        >S</button>
      </template>
      <div :class="lane" @click="seekFromLane">
        <Waveform :peaks="peaks[track.id] ?? null" :color="track.color" :height="56" :start="range.start" :end="range.end" :aria-label="`${track.name} waveform`" />
      </div>
    </TimelineRow>
  </Timeline>
</template>
