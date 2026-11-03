<script setup lang="ts">
import { css } from 'styled-system/css'
import { ref } from 'vue'
import { Badge, Button, PropertyRow, Select, Slider, Switch, type SelectOption } from '~/ui'
import { pickPaths } from '~/data/library'
import type { ClickSound } from '~/engine/engine'
import { usePerformOptions } from '~/engine/options'
import { fileName } from './songs/format'
import PageHeader from '~/shell/PageHeader.vue'
import LibraryLayout from './LibraryLayout.vue'

const sampleRate = ref(48_000)
const bufferSize = ref(128)
const sampleRates: SelectOption<number>[] = [44_100, 48_000, 96_000].map((value) => ({ value, label: `${value / 1000} kHz` }))
const bufferSizes: SelectOption<number>[] = [64, 128, 256, 512].map((value) => ({ value, label: `${value} samples` }))
const options = usePerformOptions()
const sounds: SelectOption<ClickSound>[] = [
  { value: 'beep', label: 'Beep' },
  { value: 'tick', label: 'Tick' },
  { value: 'wood', label: 'Wood block' },
]
const subdivisions: SelectOption<number>[] = [
  { value: 1, label: 'Beats' },
  { value: 2, label: 'Eighths' },
  { value: 3, label: 'Triplets' },
  { value: 4, label: 'Sixteenths' },
]
const countIns: SelectOption<number>[] = [0, 1, 2, 4].map((value) => ({ value, label: value === 0 ? 'Off' : `${value} ${value === 1 ? 'bar' : 'bars'}` }))
async function chooseVoices() {
  const [folder] = await pickPaths('folder')
  if (folder) options.guide.voices = folder
}
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
      <section :class="card" aria-labelledby="settings-click">
        <div :class="cardHeader">
          <h2 id="settings-click" :class="cardTitle">Click</h2>
          <Switch v-model="options.click.enabled" aria-label="Click on" />
        </div>
        <PropertyRow label="Sound"><Select v-model="options.click.sound" :options="sounds" aria-label="Click sound" /></PropertyRow>
        <PropertyRow label="Subdivision"><Select v-model="options.click.subdivisions" :options="subdivisions" aria-label="Click subdivision" /></PropertyRow>
        <PropertyRow label="Count-in"><Select v-model="options.click.countInBars" :options="countIns" aria-label="Count-in" /></PropertyRow>
        <PropertyRow label="Level">
          <Slider :model-value="Math.round(options.click.gain * 100)" :min="0" :max="100" aria-label="Click level" @update:model-value="(value: number) => (options.click.gain = value / 100)" />
        </PropertyRow>
        <p :class="hint">Generated from each song's tempo map, with an accent on the downbeat. Solo never silences it.</p>
      </section>
      <section :class="card" aria-labelledby="settings-guide">
        <div :class="cardHeader">
          <h2 id="settings-guide" :class="cardTitle">Guide</h2>
          <Switch v-model="options.guide.enabled" aria-label="Guide on" />
        </div>
        <PropertyRow label="Voices">
          <Button size="sm" icon="lucide:folder-open" :title="options.guide.voices ?? undefined" @click="chooseVoices">
            {{ options.guide.voices ? fileName(options.guide.voices) : 'Choose folder…' }}
          </Button>
        </PropertyRow>
        <PropertyRow label="Count 2, 3, 4"><Switch v-model="options.guide.count" aria-label="Count beats after the section name" /></PropertyRow>
        <PropertyRow label="Level">
          <Slider :model-value="Math.round(options.guide.gain * 100)" :min="0" :max="100" aria-label="Guide level" @update:model-value="(value: number) => (options.guide.gain = value / 100)" />
        </PropertyRow>
        <p :class="hint">
          A folder of WAV files named after sections (verse.wav, chorus.wav, bridge.wav…) and counts (2.wav, 3.wav, 4.wav). The guide speaks the
          section name on the bar before it. Stems ships no voices: record your own or use ones you may redistribute.
        </p>
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
