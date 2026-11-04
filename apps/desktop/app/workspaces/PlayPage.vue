<script setup lang="ts">
// Play workspace (docs/architecture/04-ui.md): setlist rail, section strip, track lanes and the
// transport. Large hit targets for stage use; every action has a key. The engine is the clock.
import type { Setlist, Song } from '@stems/schema'
import { createTempoGrid, formatBarBeat, samplesToBarBeat } from '@stems/core'
import { css } from 'styled-system/css'
import { Icon, NuxtLink } from '#components'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Badge, Button, EmptyState, IconButton, Panel, SegmentedControl, Select, Slider, type SegmentOption, type SelectOption } from '~/ui'
import { getSetlist, listSetlists, type SetlistSummary } from '~/data/setlists'
import { getSong } from '~/data/songs'
import { formatFrames, type Quantize } from '~/engine/engine'
import { usePerformOptions } from '~/engine/options'
import { usePlayer, useSmoothPosition } from '~/engine/player'
import { fromEngine } from '~/engine/songDoc'
import SectionStrip from './play/SectionStrip.vue'
import TrackLanes from './play/TrackLanes.vue'
import ResizeHandle from '~/shell/ResizeHandle.vue'
import { usePanel } from '~/shell/panel'

const route = useRoute()
const player = usePlayer()
/** The setlist rail: hide with B or the button; drag its edge to resize, or far left to hide it. */
const RAIL_WIDTH = 260
const rail = usePanel('play.setlist', { width: RAIL_WIDTH, min: 180, max: 440 })
const options = usePerformOptions()
const smooth = useSmoothPosition()
const setlists = ref<SetlistSummary[]>([])
const chosen = ref<string | undefined>(undefined)
const missing = ref<string[]>([])

const quantizeOptions: SegmentOption<Quantize>[] = [
  { value: 'beat', label: 'Beat' },
  { value: 'bar', label: 'Bar' },
  { value: 'section', label: 'Section' },
]
const setlistOptions = computed<SelectOption[]>(() => setlists.value.map((entry) => ({ value: entry.id, label: entry.name })))

async function openSetlist(id: string | undefined) {
  if (!id) return
  const list = await getSetlist(id)
  if (!list) return
  const found = await Promise.all(list.items.map((item) => getSong(item.songId).catch(() => null)))
  missing.value = list.items.filter((_, at) => !found[at]).map((item) => item.songId)
  // Songs that no longer exist are left out, with their setlist items.
  const items = list.items.filter((_, at) => found[at])
  const songs = found.filter((song): song is Song => song !== null)
  const playable: Setlist = { ...list, items }
  if (songs.length) await player.loadSetlist(playable, songs, 0)
}

onMounted(async () => {
  setlists.value = await listSetlists().catch(() => [])
  const requested = typeof route.query.setlist === 'string' ? route.query.setlist : undefined
  chosen.value = requested ?? player.setlist.value?.id
  if (requested && requested !== player.setlist.value?.id) await openSetlist(requested)
})

watch(chosen, (id, previous) => {
  if (id && id !== previous && id !== player.setlist.value?.id) void openSetlist(id)
})

/** bar.beat of the play head, from the song's tempo map. */
const barBeat = computed(() => {
  const song = player.song.value
  if (!song || !player.sampleRate.value) return '—'
  const grid = createTempoGrid({ sampleRate: song.sampleRate, bpm: song.bpm, timeSignature: song.timeSignature, tempoMap: song.tempoMap })
  return formatBarBeat(samplesToBarBeat(grid, fromEngine(smooth.value, song.sampleRate, player.sampleRate.value)))
})

const status = computed(() => {
  const state = player.state.value
  if (!state) return null
  const rate = state.sampleRate || 1
  if (state.countIn > 0) return { tone: 'info' as const, label: `Count-in ${Math.ceil(state.countIn / rate)}` }
  if (state.waiting > 0) return { tone: 'info' as const, label: `Next song in ${Math.ceil(state.waiting / rate)} s` }
  if (state.crossfading) return { tone: 'info' as const, label: 'Crossfading' }
  if (state.armed !== 'none') {
    const what = { jump: 'Jump', vamp: 'Vamp', stop: 'Stop', endSong: 'End song', none: '' }[state.armed]
    const bars = player.song.value ? ` in ${formatFrames(Math.max(0, state.armedAt - state.position), rate)}` : ''
    return { tone: 'warning' as const, label: `${what}${bars}` }
  }
  if (state.vamping) return { tone: 'warning' as const, label: 'Vamping' }
  return null
})

/** CPU and dropouts: underruns mean the disk could not keep up, xruns that the device ran dry. */
const health = computed(() => {
  const state = player.state.value
  if (!state) return null
  const problems = state.underruns + state.xruns
  return { label: `CPU ${Math.round(state.cpuLoad * 100)}%${problems ? ` · ${state.underruns} underruns · ${state.xruns} xruns` : ''}`, bad: problems > 0 }
})

const clickLevel = computed({ get: () => Math.round(options.click.gain * 100), set: (value: number) => (options.click.gain = value / 100) })
const guideLevel = computed({ get: () => Math.round(options.guide.gain * 100), set: (value: number) => (options.guide.gain = value / 100) })

// Keyboard: Space play/pause, 1–9 jump, V hold to vamp, L loop toggle, S stop at section end,
// K skip next section, N next song, Esc cancel, P lock.
let vampKey = false
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]')
}
function onKeyDown(event: KeyboardEvent) {
  if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
  const digit = /^Digit([1-9])$/.exec(event.code)
  if (digit) {
    event.preventDefault()
    void player.jumpToSection(Number(digit[1]) - 1)
    return
  }
  if (event.repeat) return
  const actions: Record<string, () => unknown> = {
    Space: () => player.toggle(),
    KeyV: () => {
      vampKey = true
      return player.vamp()
    },
    KeyL: () => player.toggleVamp(),
    KeyS: () => player.stopAtSectionEnd(),
    KeyK: () => player.skipNextSection(),
    KeyN: () => player.nextSongNow(),
    Escape: () => player.cancelArmed(),
    KeyB: () => rail.toggle(),
    KeyP: () => (player.locked.value = !player.locked.value),
  }
  const action = actions[event.code]
  if (action && !(event.code === 'Space' && event.target instanceof HTMLButtonElement)) {
    event.preventDefault()
    void action()
  }
}
function onKeyUp(event: KeyboardEvent) {
  if (event.code === 'KeyV' && vampKey) {
    vampKey = false
    void player.releaseVamp()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

function itemState(at: number): 'current' | 'next' | 'played' | null {
  if (at === player.index.value) return 'current'
  if (at === player.nextIndex.value) return 'next'
  return at < player.index.value ? 'played' : null
}

const root = css({ display: 'grid', gridTemplateColumns: '[260px 1fr]', gridTemplateRows: '[auto minmax(0, 1fr)]', h: 'full', minH: '0' })
const railClass = css({ position: 'relative', gridRow: '2', gridColumn: '1', minH: '0', minW: '0', overflow: 'hidden' })
const narrowHide = css({ '@media (max-width: 1250px)': { display: 'none' } })
const tightHide = css({ '@media (max-width: 1000px)': { display: 'none' } })
const railBody = css({ display: 'flex', flexDirection: 'column', gap: '2', p: '3', minH: '0', overflowY: 'auto' })
const railItem = css({
  display: 'grid',
  gridTemplateColumns: '[24px 1fr auto]',
  alignItems: 'center',
  gap: '2',
  minH: '[48px]',
  px: '2',
  borderRadius: 'md',
  textAlign: 'left',
  textStyle: 'ui.sm',
  color: 'fg.default',
  _hover: { bg: 'bg.hover' },
  _disabled: { cursor: 'not-allowed' },
  '&[data-state=current]': { bg: 'bg.hover', color: 'accent.default' },
  '&[data-state=played]': { color: 'fg.subtle' },
})
const railNumber = css({ color: 'fg.subtle', fontVariantNumeric: 'tabular-nums', textAlign: 'right' })
const railTitle = css({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const warning = css({ textStyle: 'ui.xs', color: 'warning.default' })
const stage = css({ gridRow: '2', gridColumn: '2', display: 'flex', flexDirection: 'column', minW: '0', minH: '0', bg: 'bg.canvas' })
const center = css({ flex: '1', display: 'grid', placeItems: 'center' })
const transport = css({
  gridRow: '1',
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  h: '[60px]',
  px: '3',
  flexWrap: 'nowrap',
  overflow: 'hidden',
  bg: 'bg.panel',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
})
const divider = css({ w: '[1px]', h: '[28px]', bg: 'border.default', mx: '1', flexShrink: '0' })
const group = css({ display: 'flex', alignItems: 'center', gap: '2' })
const groupLabel = css({ textStyle: 'ui.label', color: 'fg.subtle', textTransform: 'uppercase' })
const spacer = css({ flex: '1' })
const level = css({ display: 'flex', alignItems: 'center', gap: '1.5', flexShrink: '1', minW: '0' })
const levelSlider = css({ w: '[110px]' })
const readout = css({ display: 'flex', flexDirection: 'column', minW: '[96px]', flexShrink: '0', px: '2', py: '1', borderRadius: 'md', bg: 'bg.input' })
const readoutBig = css({ fontFamily: 'mono', textStyle: 'ui.title', color: 'fg.default', fontVariantNumeric: 'tabular-nums' })
const readoutSmall = css({ fontFamily: 'mono', textStyle: 'ui.xs', color: 'fg.subtle', fontVariantNumeric: 'tabular-nums' })
const playButton = css({
  display: 'grid',
  placeItems: 'center',
  w: '[44px]',
  h: '[44px]',
  flexShrink: '0',
  borderRadius: 'full',
  background: '[token(gradients.sheen), token(colors.accent.default)]',
  color: 'accent.fg',
  _disabled: { opacity: '0.4', cursor: 'not-allowed' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[2px]' },
})
const errorText = css({ textStyle: 'ui.xs', color: 'danger.default', maxW: '[320px]', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
</script>

<template>
  <div :class="root" :style="{ gridTemplateColumns: `${rail.visible.value ? rail.width.value : 0}px minmax(0, 1fr)` }">
    <div v-if="rail.visible.value" :class="railClass">
      <ResizeHandle :width="rail.width.value" label="Resize the setlist" @resize="rail.resize" @reset="rail.resize(RAIL_WIDTH)" />
      <Panel title="Setlist" bordered="right">
        <div :class="railBody">
          <Select v-model="chosen" :options="setlistOptions" placeholder="Choose a setlist" :disabled="player.locked.value || !setlists.length" aria-label="Setlist" />
          <EmptyState v-if="!setlists.length" icon="lucide:list-music" title="No setlists" description="Build a setlist from your songs, then play it here." size="sm">
            <template #actions>
              <NuxtLink to="/setlists"><Button size="sm" tabindex="-1">Open setlists</Button></NuxtLink>
            </template>
          </EmptyState>
          <span v-if="missing.length" :class="warning">{{ missing.length }} songs in this setlist are no longer in the library.</span>
          <button
            v-for="(song, at) in player.songs.value"
            :key="`${song.id}-${at}`"
            type="button"
            :class="railItem"
            :data-state="itemState(at)"
            :disabled="player.locked.value || player.loading.value"
            @click="player.goTo(at)"
          >
            <span :class="railNumber">{{ at + 1 }}</span>
            <span :class="railTitle">{{ song.title }}</span>
            <Badge v-if="itemState(at) === 'current'" size="sm" tone="success" label="Now" />
            <Badge v-else-if="itemState(at) === 'next'" size="sm" tone="info" label="Next" />
          </button>
        </div>
      </Panel>
    </div>

    <header :class="transport" aria-label="Transport">
      <IconButton
        icon="lucide:panel-left"
        :label="rail.visible.value ? 'Hide the setlist (B)' : 'Show the setlist (B)'"
        size="md"
        :active="rail.visible.value"
        @click="rail.toggle()"
      />
      <button
        type="button"
        :class="playButton"
        :disabled="!player.song.value"
        :aria-label="player.playing.value ? 'Pause (Space)' : 'Play (Space)'"
        @click="player.toggle()"
      >
        <Icon :name="player.playing.value ? 'lucide:pause' : 'lucide:play'" :size="24" aria-hidden="true" />
      </button>
      <IconButton icon="lucide:square" label="Stop and return to start" size="md" :disabled="!player.song.value" @click="player.stop()" />
      <IconButton
        icon="lucide:repeat"
        label="Vamp this section (L, or hold V)"
        size="md"
        :active="player.state.value?.vamping ?? false"
        :disabled="!player.song.value"
        @click="player.toggleVamp()"
      />
      <IconButton icon="lucide:circle-stop" label="Stop at end of section (S)" size="md" :disabled="!player.playing.value" @click="player.stopAtSectionEnd()" />
      <IconButton icon="lucide:chevrons-right" label="Skip next section (K)" size="md" :disabled="!player.playing.value" @click="player.skipNextSection()" />
      <IconButton icon="lucide:skip-forward" label="Next song (N)" size="md" :disabled="player.nextIndex.value === null" @click="player.nextSongNow()" />

      <span :class="divider" />
      <div :class="readout">
        <span :class="readoutBig">{{ barBeat }}</span>
        <span :class="readoutSmall">{{ formatFrames(smooth, player.sampleRate.value) }} / {{ formatFrames(player.length.value, player.sampleRate.value) }}</span>
      </div>
      <Badge v-if="status" :tone="status.tone" dot :label="status.label" />
      <IconButton v-if="player.state.value?.armed !== 'none' && player.state.value" icon="lucide:x" label="Cancel (Esc)" size="sm" @click="player.cancelArmed()" />
      <Badge v-if="health" :class="narrowHide" :tone="health.bad ? 'danger' : 'neutral'" size="sm" :label="health.label" title="Audio engine load and dropouts since the device opened" />
      <span v-if="player.error.value" :class="errorText" role="alert" :title="player.error.value">{{ player.error.value }}</span>

      <span :class="spacer" />
      <div :class="group">
        <span :class="[groupLabel, narrowHide]">Quantize</span>
        <SegmentedControl v-model="player.quantize.value" :options="quantizeOptions" :fill="false" aria-label="Quantize" />
      </div>
      <div :class="level">
        <IconButton
          icon="lucide:metronome"
          :label="options.click.enabled ? 'Click on: turn off' : 'Click off: turn on'"
          size="sm"
          :active="options.click.enabled"
          @click="options.click.enabled = !options.click.enabled"
        />
        <div :class="[levelSlider, tightHide]"><Slider v-model="clickLevel" :min="0" :max="100" :disabled="!options.click.enabled" aria-label="Click level" /></div>
      </div>
      <div :class="level">
        <IconButton
          icon="lucide:message-square"
          :label="options.guide.enabled ? 'Guide on: turn off' : 'Guide off: turn on'"
          size="sm"
          :active="options.guide.enabled"
          @click="options.guide.enabled = !options.guide.enabled"
        />
        <div :class="[levelSlider, tightHide]"><Slider v-model="guideLevel" :min="0" :max="100" :disabled="!options.guide.enabled" aria-label="Guide level" /></div>
      </div>
      <span :class="divider" />
      <IconButton
        :icon="player.locked.value ? 'lucide:lock' : 'lucide:lock-open'"
        :label="player.locked.value ? 'Unlock editing (P)' : 'Lock for performance (P)'"
        size="md"
        :active="player.locked.value"
        @click="player.locked.value = !player.locked.value"
      />
    </header>
    <section :class="stage" aria-label="Song">
      <SectionStrip />
      <TrackLanes v-if="player.song.value" />
      <div v-else :class="center">
        <EmptyState icon="lucide:audio-waveform" title="No song loaded" description="Choose a setlist, or play a song from Songs." />
      </div>
    </section>

  </div>
</template>
