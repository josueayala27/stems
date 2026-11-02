<script setup lang="ts">
import { css } from 'styled-system/css'
import { Icon, NuxtLink } from '#components'
import { ref } from 'vue'
import { Button, EmptyState, IconButton, Panel, SegmentedControl, Slider, type SegmentOption } from '~/ui'
import type { QuantizeTarget } from '@stems/core'

// Layout from docs/architecture/04-ui.md: setlist rail, section strip, track lanes, transport bar.
// Nothing plays yet, so every region shows its empty state and the transport is disabled.

const quantize = ref<QuantizeTarget>('bar')
const quantizeOptions: SegmentOption<QuantizeTarget>[] = [
  { value: 'beat', label: 'Beat' },
  { value: 'bar', label: 'Bar' },
  { value: 'section', label: 'Section' },
]
const clickLevel = ref(80)
const guideLevel = ref(80)
const placeholderSections = ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Outro']

const root = css({
  display: 'grid',
  gridTemplateColumns: '[240px 1fr]',
  gridTemplateRows: '[1fr auto]',
  h: 'full',
  minH: '0',
})
const rail = css({ gridRow: '1', gridColumn: '1', minH: '0' })
const stage = css({ gridRow: '1', gridColumn: '2', display: 'flex', flexDirection: 'column', minW: '0', minH: '0', bg: 'bg.canvas' })
const strip = css({
  display: 'flex',
  gap: '1.5',
  p: '3',
  flexShrink: '0',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
  overflowX: 'auto',
})
const sectionChip = css({
  display: 'grid',
  placeItems: 'center',
  minW: '[96px]',
  h: '[56px]',
  px: '3',
  borderRadius: 'md',
  borderWidth: '1px',
  borderStyle: 'dashed',
  borderColor: 'border.strong',
  color: 'fg.subtle',
  textStyle: 'ui.md',
})
const lanes = css({ flex: '1', minH: '0', display: 'flex', flexDirection: 'column' })
const laneHeader = css({
  display: 'grid',
  gridTemplateColumns: '[200px 1fr]',
  h: 'control.lg',
  flexShrink: '0',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
  textStyle: 'ui.label',
  color: 'fg.subtle',
  textTransform: 'uppercase',
})
const laneHeaderCell = css({ display: 'flex', alignItems: 'center', px: '3' })
const laneHeaderRuler = css({ borderLeftWidth: '1px', borderColor: 'border.default' })
const lanesBody = css({ flex: '1', minH: '0', display: 'grid', placeItems: 'center' })
const transport = css({
  gridRow: '2',
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  gap: '4',
  h: '[72px]',
  px: '4',
  bg: 'bg.panel',
  borderTopWidth: '1px',
  borderColor: 'border.default',
})
const group = css({ display: 'flex', alignItems: 'center', gap: '2' })
const groupLabel = css({ textStyle: 'ui.label', color: 'fg.subtle', textTransform: 'uppercase' })
const spacer = css({ flex: '1' })
const level = css({ display: 'flex', alignItems: 'center', gap: '2', w: '[160px]' })
const playButton = css({
  display: 'grid',
  placeItems: 'center',
  w: '[48px]',
  h: '[48px]',
  borderRadius: 'full',
  background: '[token(gradients.sheen), token(colors.accent.default)]',
  color: 'accent.fg',
  _disabled: { opacity: '0.4', cursor: 'not-allowed' },
})
</script>

<template>
  <div :class="root">
    <div :class="rail">
      <Panel title="Setlist" bordered="right">
        <EmptyState icon="lucide:list-music" title="No setlist loaded" description="Build a setlist from your songs, then load it here to play." size="sm">
          <template #actions>
            <NuxtLink to="/setlists"><Button size="sm" tabindex="-1">Open setlists</Button></NuxtLink>
          </template>
        </EmptyState>
      </Panel>
    </div>

    <section :class="stage" aria-label="Song">
      <div :class="strip" role="list" aria-label="Sections">
        <span v-for="(name, index) in placeholderSections" :key="index" :class="sectionChip" role="listitem" aria-disabled="true">{{ name }}</span>
      </div>
      <div :class="lanes">
        <div :class="laneHeader">
          <span :class="laneHeaderCell">Tracks</span>
          <span :class="[laneHeaderCell, laneHeaderRuler]">Timeline</span>
        </div>
        <div :class="lanesBody">
          <EmptyState icon="lucide:audio-waveform" title="No song loaded" description="Track lanes with waveforms, mute and solo appear here when a song is loaded." />
        </div>
      </div>
    </section>

    <footer :class="transport" aria-label="Transport">
      <button type="button" :class="playButton" disabled aria-label="Play">
        <Icon name="lucide:play" :size="22" aria-hidden="true" />
      </button>
      <IconButton icon="lucide:square" label="Stop" size="lg" disabled />
      <IconButton icon="lucide:repeat" label="Loop section" size="lg" disabled />
      <IconButton icon="lucide:skip-forward" label="Next song" size="lg" disabled />
      <div :class="group">
        <span :class="groupLabel">Quantize</span>
        <SegmentedControl v-model="quantize" :options="quantizeOptions" :fill="false" aria-label="Quantize" />
      </div>
      <span :class="spacer" />
      <div :class="level">
        <span :class="groupLabel">Click</span>
        <Slider v-model="clickLevel" aria-label="Click level" disabled />
      </div>
      <div :class="level">
        <span :class="groupLabel">Guide</span>
        <Slider v-model="guideLevel" aria-label="Guide level" disabled />
      </div>
    </footer>
  </div>
</template>
