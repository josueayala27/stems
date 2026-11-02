<script setup lang="ts">
import { css } from 'styled-system/css'
import { ref } from 'vue'
import { Badge, PropertyRow, Select, Switch, type SelectOption } from '~/ui'
import PageHeader from '~/shell/PageHeader.vue'
import LibraryLayout from './LibraryLayout.vue'

const sampleRate = ref(48_000)
const bufferSize = ref(128)
const sampleRates: SelectOption<number>[] = [44_100, 48_000, 96_000].map((value) => ({ value, label: `${value / 1000} kHz` }))
const bufferSizes: SelectOption<number>[] = [64, 128, 256, 512].map((value) => ({ value, label: `${value} samples` }))
const link = ref(false)
const ltc = ref(false)
const mtc = ref(false)

const grid = css({ display: 'grid', gridTemplateColumns: '[repeat(auto-fill, minmax(360px, 1fr))]', gap: '4' })
const card = css({ display: 'flex', flexDirection: 'column', gap: '3', p: '4', borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default' })
const cardHeader = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2' })
const cardTitle = css({ textStyle: 'ui.title', color: 'fg.default' })
const hint = css({ textStyle: 'ui.sm', color: 'fg.muted' })
</script>

<template>
  <LibraryLayout>
    <PageHeader eyebrow="System" title="Settings" subtitle="Audio device, rig, MIDI, Link, timecode and Lumen." />
    <div :class="grid">
      <section :class="card" aria-labelledby="settings-audio">
        <div :class="cardHeader">
          <h2 id="settings-audio" :class="cardTitle">Audio device</h2>
          <Badge tone="warning" dot label="Not connected" />
        </div>
        <PropertyRow label="Device"><Select :options="[]" placeholder="No devices found" disabled aria-label="Audio device" /></PropertyRow>
        <PropertyRow label="Sample rate"><Select v-model="sampleRate" :options="sampleRates" disabled aria-label="Sample rate" /></PropertyRow>
        <PropertyRow label="Buffer"><Select v-model="bufferSize" :options="bufferSizes" disabled aria-label="Buffer size" /></PropertyRow>
      </section>
      <section :class="card" aria-labelledby="settings-rig">
        <div :class="cardHeader"><h2 id="settings-rig" :class="cardTitle">Rig</h2></div>
        <p :class="hint">Buses and their output channels. Routing belongs to the rig, so every song plays through the same outputs.</p>
        <PropertyRow label="Rig"><Select :options="[]" placeholder="No rigs" disabled aria-label="Rig" /></PropertyRow>
      </section>
      <section :class="card" aria-labelledby="settings-midi">
        <div :class="cardHeader"><h2 id="settings-midi" :class="cardTitle">MIDI</h2></div>
        <PropertyRow label="Output"><Select :options="[]" placeholder="No MIDI ports" disabled aria-label="MIDI output" /></PropertyRow>
        <PropertyRow label="Input"><Select :options="[]" placeholder="No MIDI ports" disabled aria-label="MIDI input" /></PropertyRow>
      </section>
      <section :class="card" aria-labelledby="settings-link">
        <div :class="cardHeader"><h2 id="settings-link" :class="cardTitle">Ableton Link</h2></div>
        <PropertyRow label="Join session"><Switch v-model="link" disabled aria-label="Join Link session" /></PropertyRow>
      </section>
      <section :class="card" aria-labelledby="settings-timecode">
        <div :class="cardHeader"><h2 id="settings-timecode" :class="cardTitle">Timecode</h2></div>
        <PropertyRow label="LTC out"><Switch v-model="ltc" disabled aria-label="LTC out" /></PropertyRow>
        <PropertyRow label="MTC out"><Switch v-model="mtc" disabled aria-label="MTC out" /></PropertyRow>
      </section>
      <section :class="card" aria-labelledby="settings-lumen">
        <div :class="cardHeader"><h2 id="settings-lumen" :class="cardTitle">Lumen</h2></div>
        <p :class="hint">Lumen follows Stems through LTC or MTC. Enable timecode out and point Lumen at the same channel or port.</p>
      </section>
    </div>
  </LibraryLayout>
</template>
