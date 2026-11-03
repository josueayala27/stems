<script setup lang="ts">
// Track lanes: name, mute and solo, waveform from peak files, and the play head.
import { css } from 'styled-system/css'
import { shallowRef, watch } from 'vue'
import type { Peaks } from '~/audio/peaks'
import Waveform from '~/audio/Waveform.vue'
import { library } from '~/data/library'
import { usePlayer, useSmoothPosition } from '~/engine/player'

const player = usePlayer()
const smooth = useSmoothPosition()
const peaks = shallowRef<Record<string, Peaks | null>>({})
const cache = new Map<string, Peaks | null>()

watch(
  () => player.song.value,
  async (song) => {
    if (!song) return
    const loaded: Record<string, Peaks | null> = {}
    await Promise.all(
      song.tracks.map(async (track) => {
        if (!cache.has(track.hash)) cache.set(track.hash, await library.peaks(track.hash).catch(() => null))
        loaded[track.id] = cache.get(track.hash) ?? null
      }),
    )
    peaks.value = loaded
  },
  { immediate: true },
)

function headPercent(): number {
  const length = player.length.value
  return length > 0 ? (smooth.value / length) * 100 : 0
}

function seek(event: MouseEvent) {
  if (player.locked.value) return
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  void player.seek(ratio * player.length.value)
}

/** Section blocks for the ruler, as percentages of the song. */
function rulerBlocks() {
  const length = player.length.value
  if (!length) return []
  return player.sections.value.map((section) => ({
    name: section.name,
    left: (section.start / length) * 100,
    width: ((section.end - section.start) / length) * 100,
  }))
}


const lanes = css({ flex: '1', minH: '0', display: 'flex', flexDirection: 'column', overflowY: 'auto' })
const row = css({ display: 'grid', gridTemplateColumns: '[200px 1fr]', borderBottomWidth: '1px', borderColor: 'border.default', minH: '[56px]' })
const head = css({ display: 'flex', alignItems: 'center', gap: '2', px: '3', minW: '0' })
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
const lane = css({ position: 'relative', borderLeftWidth: '1px', borderColor: 'border.default', cursor: 'pointer', overflow: 'hidden' })
const playhead = css({ position: 'absolute', top: '0', bottom: '0', w: '[2px]', bg: 'accent.default', pointerEvents: 'none', transform: 'translateX(-1px)' })
const ruler = css({ position: 'relative', h: 'control.lg', borderLeftWidth: '1px', borderColor: 'border.default', cursor: 'pointer' })
const block = css({
  position: 'absolute',
  top: '1',
  bottom: '1',
  px: '1.5',
  display: 'flex',
  alignItems: 'center',
  borderRadius: 'xs',
  bg: 'bg.hover',
  borderLeftWidth: '2px',
  borderColor: 'border.strong',
  textStyle: 'ui.xs',
  color: 'fg.muted',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
})
const rulerRow = css({ minH: 'control.lg', position: 'sticky', top: '0', zIndex: '[1]', bg: 'bg.canvas' })
const label = css({ display: 'flex', alignItems: 'center', px: '3', textStyle: 'ui.label', color: 'fg.subtle', textTransform: 'uppercase' })
</script>

<template>
  <div :class="lanes">
    <div :class="[row, rulerRow]">
      <span :class="label">Tracks</span>
      <div :class="ruler" role="slider" aria-label="Song position" :aria-valuenow="Math.round(headPercent())" aria-valuemin="0" aria-valuemax="100" @click="seek">
        <span v-for="(item, at) in rulerBlocks()" :key="at" :class="block" :style="{ left: `${item.left}%`, width: `${item.width}%` }">{{ item.name }}</span>
        <span :class="playhead" :style="{ left: `${headPercent()}%` }" />
      </div>
    </div>
    <div v-for="(track, at) in player.song.value?.tracks ?? []" :key="track.id" :class="row">
      <div :class="head">
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
      </div>
      <div :class="lane" @click="seek">
        <Waveform :peaks="peaks[track.id] ?? null" :color="track.color" :height="56" :aria-label="`${track.name} waveform`" />
        <span :class="playhead" :style="{ left: `${headPercent()}%` }" />
      </div>
    </div>
  </div>
</template>
