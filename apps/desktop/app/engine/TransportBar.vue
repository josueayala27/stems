<script setup lang="ts">
// Play, pause, stop and seek for the loaded song. Shown at the bottom of the shell once a song is loaded.
import { css } from 'styled-system/css'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { IconButton, Slider } from '~/ui'
import { formatFrames } from './engine'
import { usePlayer } from './player'

const player = usePlayer()

// While dragging, the thumb follows the pointer and the seek is sent on release.
const scrubbing = ref(false)
const scrubValue = ref(0)
const sliderValue = computed({
  get: () => (scrubbing.value ? scrubValue.value : player.position.value),
  set: (value: number) => {
    scrubValue.value = value
    if (!scrubbing.value) void player.seek(value)
  },
})

function endScrub() {
  scrubbing.value = false
  void player.seek(scrubValue.value)
}

function onKey(event: KeyboardEvent) {
  if (event.code !== 'Space' || event.repeat || !player.song.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, button, [contenteditable="true"], [role="slider"]')) return
  event.preventDefault()
  void player.toggle()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const health = computed(() => {
  const state = player.state.value
  if (!state) return ''
  const parts = [`CPU ${Math.round(state.cpuLoad * 100)}%`]
  if (state.xruns) parts.push(`${state.xruns} xruns`)
  if (state.underruns) parts.push(`${state.underruns} underruns`)
  return parts.join(' · ')
})

const bar = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  h: '[52px]',
  px: '3',
  flexShrink: '0',
  bg: 'bg.panel',
  borderTopWidth: '1px',
  borderColor: 'border.default',
})
const title = css({ textStyle: 'ui.sm', color: 'fg.default', w: '[180px]', flexShrink: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const time = css({ textStyle: 'ui.sm', fontFamily: 'mono', color: 'fg.muted', flexShrink: '0', fontVariantNumeric: 'tabular-nums' })
const seek = css({ flex: '1', minW: '0' })
const meta = css({ textStyle: 'ui.xs', color: 'fg.subtle', flexShrink: '0', fontFamily: 'mono' })
const errorText = css({ textStyle: 'ui.xs', color: 'danger.default', flexShrink: '1', minW: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
</script>

<template>
  <div v-if="player.song.value || player.error.value" :class="bar" role="region" aria-label="Transport">
    <IconButton
      :icon="player.playing.value ? 'lucide:pause' : 'lucide:play'"
      :label="player.playing.value ? 'Pause' : 'Play'"
      shortcut="Space"
      :disabled="!player.song.value"
      @click="player.toggle()"
    />
    <IconButton icon="lucide:square" label="Stop and return to start" :disabled="!player.song.value" @click="player.stop()" />
    <span :class="title" :title="player.song.value?.title">{{ player.song.value?.title }}</span>
    <span :class="time">{{ formatFrames(sliderValue, player.sampleRate.value) }}</span>
    <div :class="seek">
      <Slider
        v-model="sliderValue"
        :min="0"
        :max="Math.max(1, player.length.value)"
        :step="1"
        :disabled="!player.song.value"
        aria-label="Position"
        :value-text="formatFrames(sliderValue, player.sampleRate.value)"
        @scrub-start="(scrubbing = true), (scrubValue = player.position.value)"
        @scrub-end="endScrub"
      />
    </div>
    <span :class="time">{{ formatFrames(player.length.value, player.sampleRate.value) }}</span>
    <span v-if="player.error.value" :class="errorText" role="alert" :title="player.error.value">{{ player.error.value }}</span>
    <span v-else :class="meta">{{ health }}</span>
  </div>
</template>
