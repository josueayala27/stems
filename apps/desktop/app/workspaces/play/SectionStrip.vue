<script setup lang="ts">
// Sections of the current song. Click: jump there at the quantize boundary. Hold the current
// section: vamp it until released.
import { css } from 'styled-system/css'
import { Icon } from '#components'
import { computed, onBeforeUnmount } from 'vue'
import { usePlayer, useSmoothPosition } from '~/engine/player'

const HOLD_MS = 350
const player = usePlayer()
const smooth = useSmoothPosition()

let holdTimer: ReturnType<typeof setTimeout> | null = null
let held = false

function down(at: number, event: PointerEvent) {
  if (event.button !== 0) return
  held = false
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  holdTimer = setTimeout(() => {
    held = true
    if (at === player.sectionIndex.value) void player.vamp()
  }, HOLD_MS)
}

function up(at: number) {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
  if (held) {
    if (player.state.value?.vamping) void player.releaseVamp()
  } else {
    void player.jumpToSection(at)
  }
  held = false
}

function cancel() {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
  if (held && player.state.value?.vamping) void player.releaseVamp()
  held = false
}

onBeforeUnmount(cancel)

const armedTarget = computed(() => {
  const state = player.state.value
  return state?.armed === 'jump' ? state.armedTo : null
})

function progress(at: number): number {
  const section = player.sections.value[at]
  if (!section || at !== player.sectionIndex.value) return 0
  return Math.min(1, Math.max(0, (smooth.value - section.start) / (section.end - section.start)))
}

const strip = css({ display: 'flex', gap: '1.5', p: '3', flexShrink: '0', borderBottomWidth: '1px', borderColor: 'border.default', overflowX: 'auto' })
const chip = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5',
  minW: '[104px]',
  h: '[64px]',
  px: '3',
  borderRadius: 'md',
  borderWidth: '1px',
  borderColor: 'border.default',
  bg: 'bg.panel',
  color: 'fg.default',
  textStyle: 'ui.md',
  overflow: 'hidden',
  userSelect: 'none',
  touchAction: 'none',
  cursor: 'pointer',
  _hover: { bg: 'bg.hover' },
  '&[data-current=true]': { borderColor: 'accent.default', color: 'accent.default' },
  '&[data-armed=true]': { borderColor: 'warning.default', borderStyle: 'dashed', borderWidth: '2px' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[2px]' },
})
const fill = css({ position: 'absolute', left: '0', bottom: '0', h: '[3px]', bg: 'accent.default' })
const key = css({ textStyle: 'ui.xs', color: 'fg.subtle', fontFamily: 'mono' })
const empty = css({ textStyle: 'ui.sm', color: 'fg.subtle', px: '1', alignSelf: 'center' })
</script>

<template>
  <div :class="strip" role="toolbar" aria-label="Sections: click to jump, hold the current section to vamp">
    <span v-if="!player.sections.value.length" :class="empty">
      {{ player.song.value ? 'This song has no sections yet. Add them in Arrange.' : 'No song loaded.' }}
    </span>
    <button
      v-for="(section, at) in player.sections.value"
      :key="`${section.start}-${at}`"
      type="button"
      :class="chip"
      :data-current="at === player.sectionIndex.value"
      :data-armed="armedTarget === section.start"
      :aria-pressed="at === player.sectionIndex.value"
      :aria-label="`${section.name}${at < 9 ? `, key ${at + 1}` : ''}`"
      @pointerdown="down(at, $event)"
      @pointerup="up(at)"
      @pointercancel="cancel"
      @keydown.enter.prevent="player.jumpToSection(at)"
      @keydown.space.prevent="player.jumpToSection(at)"
    >
      <span>{{ section.name }}</span>
      <span :class="key">
        <Icon v-if="at === player.sectionIndex.value && player.state.value?.vamping" name="lucide:repeat" :size="12" aria-hidden="true" />
        <template v-else-if="at < 9">{{ at + 1 }}</template>
      </span>
      <span :class="fill" :style="{ width: `${progress(at) * 100}%` }" aria-hidden="true" />
    </button>
  </div>
</template>
