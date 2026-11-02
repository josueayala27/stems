<script setup lang="ts">
import { css } from 'styled-system/css'
import { NuxtLink } from '#components'
import { onMounted, ref } from 'vue'
import type { Song } from '@stems/schema'
import { Badge, Button, EmptyState, Panel, PanelSection } from '~/ui'
import { getSong } from '~/data/songs'

const props = defineProps<{ songId: string }>()

const song = ref<Song | null>(null)
const loading = ref(true)

onMounted(async () => {
  song.value = await getSong(props.songId).catch(() => null)
  loading.value = false
})

const root = css({ display: 'flex', flexDirection: 'column', h: 'full', minH: '0' })
const header = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  h: '[52px]',
  px: '4',
  flexShrink: '0',
  bg: 'bg.panel',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
})
const titleClass = css({ textStyle: 'ui.title', color: 'fg.default' })
const spacer = css({ flex: '1' })
const body = css({ flex: '1', minH: '0', display: 'grid', gridTemplateColumns: '[1fr 300px]' })
const timeline = css({ display: 'flex', flexDirection: 'column', minW: '0', minH: '0', bg: 'bg.canvas' })
const ruler = css({ h: '[28px]', flexShrink: '0', borderBottomWidth: '1px', borderColor: 'border.default', bg: 'bg.panel' })
const lane = css({ h: '[40px]', flexShrink: '0', borderBottomWidth: '1px', borderColor: 'border.default' })
const center = css({ flex: '1', minH: '0', display: 'grid', placeItems: 'center' })
</script>

<template>
  <div :class="root">
    <header :class="header">
      <NuxtLink to="/arrange"><Button variant="ghost" size="sm" icon="lucide:arrow-left" tabindex="-1">Songs</Button></NuxtLink>
      <span :class="titleClass">{{ song?.title ?? 'Untitled song' }}</span>
      <Badge v-if="!loading && !song" tone="warning" label="Not in library" />
      <span :class="spacer" />
      <Badge tone="neutral" icon="lucide:gauge" :label="song ? `${song.bpm} BPM` : '— BPM'" />
      <Badge tone="neutral" icon="lucide:key-round" :label="song?.key || '— key'" />
    </header>
    <div :class="body">
      <section :class="timeline" aria-label="Arrangement">
        <div :class="ruler" aria-hidden="true" />
        <div :class="lane" aria-label="Sections lane" />
        <div :class="lane" aria-label="Markers lane" />
        <div :class="center">
          <EmptyState icon="lucide:audio-waveform" title="No arrangement yet" description="Sections, markers and cue events sit on this timeline, on top of the song's waveform." />
        </div>
      </section>
      <Panel title="Arrangement" bordered="left">
        <PanelSection title="Sections" collapsible storage-key="arrange.sections">
          <EmptyState title="No sections" description="Intro, verse, chorus, bridge, outro or a custom name." size="sm" />
        </PanelSection>
        <PanelSection title="Markers" collapsible storage-key="arrange.markers">
          <EmptyState title="No markers" description="Cue points with actions: stop, loop or next." size="sm" />
        </PanelSection>
        <PanelSection title="Cue events" collapsible storage-key="arrange.events">
          <EmptyState title="No cue events" description="MIDI, timecode and Lumen cues at a sample or a marker." size="sm" />
        </PanelSection>
        <PanelSection title="Tempo map" collapsible storage-key="arrange.tempo" flush>
          <EmptyState title="Constant tempo" description="Add tempo and meter changes on bar lines." size="sm" />
        </PanelSection>
      </Panel>
    </div>
  </div>
</template>
