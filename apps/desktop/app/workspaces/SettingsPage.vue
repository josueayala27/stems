<script setup lang="ts">
import type { Rig } from '@stems/schema'
import { css } from 'styled-system/css'
import { computed, onMounted, ref } from 'vue'
import { Badge, Button, Input, PropertyRow, Select, Slider, Switch, type SelectOption } from '~/ui'
import { NuxtLink } from '#components'
import { pickPaths } from '~/data/library'
import type { ClickSound, FrameRate } from '~/engine/engine'
import { usePerformOptions, validTimecode } from '~/engine/options'
import { usePlayer } from '~/engine/player'
import { fileName } from './songs/format'
import PageHeader from '~/shell/PageHeader.vue'
import LibraryLayout from './LibraryLayout.vue'

const player = usePlayer()
const rig = computed(() => player.rig.value)
const output = computed(() => player.output.value)
onMounted(() => void player.refreshDevices())

const rigOptions = computed<SelectOption<string>[]>(() => player.rigs.value.map((entry) => ({ value: entry.id, label: entry.name })))
function edit(change: (current: Rig) => Rig) {
  if (rig.value) void player.applyRig(change(rig.value))
}

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
const linkSession = ref(false)
const mtc = ref(false)

const frameRates: SelectOption<FrameRate>[] = [
  { value: '23.976', label: '23.976 fps' },
  { value: '24', label: '24 fps' },
  { value: '25', label: '25 fps' },
  { value: '29.97', label: '29.97 fps' },
  { value: '29.97df', label: '29.97 drop-frame' },
  { value: '30', label: '30 fps' },
]
const startInvalid = ref(false)
function setStart(text: string) {
  startInvalid.value = !validTimecode(text, options.timecode.rate)
  if (!startInvalid.value) options.timecode.start = text.trim()
}

const grid = css({ display: 'grid', gridTemplateColumns: '[repeat(auto-fill, minmax(360px, 1fr))]', gap: '4' })
const card = css({ display: 'flex', flexDirection: 'column', gap: '3', p: '4', borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default' })
const cardHeader = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2' })
const cardTitle = css({ textStyle: 'ui.title', color: 'fg.default' })
const hint = css({ textStyle: 'ui.sm', color: 'fg.muted' })
const link = css({ textStyle: 'ui.sm', color: 'accent.default', textDecoration: 'underline' })
</script>

<template>
  <LibraryLayout>
    <PageHeader eyebrow="System" title="Settings" subtitle="Audio device, rig, MIDI, Link, timecode and Lumen." />
    <div :class="grid">
      <section :class="card" aria-labelledby="settings-audio">
        <div :class="cardHeader">
          <h2 id="settings-audio" :class="cardTitle">Audio and outputs</h2>
          <Badge v-if="output" tone="success" dot :label="`${output.name} · ${output.channels} out`" />
          <Badge v-else tone="warning" dot label="Not connected" />
        </div>
        <p :class="hint">
          Pick the device and where everything plays in the <NuxtLink to="/mixer" :class="link">Mixer</NuxtLink>. Quick setup there gives you FOH,
          in-ears and timecode in one click.
        </p>
        <PropertyRow label="Rig">
          <Select :model-value="rig?.id" :options="rigOptions" placeholder="No rigs" :disabled="!rig" aria-label="Rig" @update:model-value="(id: string | undefined) => id && player.selectRig(id)" />
        </PropertyRow>
        <PropertyRow v-if="rig" label="Rig name">
          <Input :model-value="rig.name" aria-label="Rig name" @update:model-value="(name: string) => name.trim() && edit((current) => ({ ...current, name: name.trim() }))" />
        </PropertyRow>
        <Button size="sm" icon="lucide:plus" :disabled="!output" @click="player.newRig()">New rig</Button>
        <p :class="hint">
          A rig is one machine's setup: device, outputs and levels. Make one per venue or interface. To play through several interfaces as one, combine
          them in Audio MIDI Setup (+, Create Aggregate Device).
        </p>
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
      <section :class="card" aria-labelledby="settings-midi">
        <div :class="cardHeader"><h2 id="settings-midi" :class="cardTitle">MIDI</h2></div>
        <PropertyRow label="Output"><Select :options="[]" placeholder="No MIDI ports" disabled aria-label="MIDI output" /></PropertyRow>
        <PropertyRow label="Input"><Select :options="[]" placeholder="No MIDI ports" disabled aria-label="MIDI input" /></PropertyRow>
      </section>
      <section :class="card" aria-labelledby="settings-link">
        <div :class="cardHeader"><h2 id="settings-link" :class="cardTitle">Ableton Link</h2></div>
        <PropertyRow label="Join session"><Switch v-model="linkSession" disabled aria-label="Join Link session" /></PropertyRow>
      </section>
      <section :class="card" aria-labelledby="settings-timecode">
        <div :class="cardHeader">
          <h2 id="settings-timecode" :class="cardTitle">Timecode</h2>
          <Switch v-model="options.timecode.enabled" aria-label="LTC out" />
        </div>
        <PropertyRow label="Frame rate"><Select v-model="options.timecode.rate" :options="frameRates" aria-label="Timecode frame rate" /></PropertyRow>
        <PropertyRow label="Song start">
          <Input :model-value="options.timecode.start" mono :invalid="startInvalid" aria-label="Timecode at song start" @update:model-value="setStart" />
        </PropertyRow>
        <PropertyRow label="Hour per song"><Switch v-model="options.timecode.hourPerSong" aria-label="One timecode hour per setlist song" /></PropertyRow>
        <PropertyRow label="Level">
          <Slider :model-value="Math.round(options.timecode.gain * 100)" :min="0" :max="100" aria-label="LTC level" @update:model-value="(value: number) => (options.timecode.gain = value / 100)" />
        </PropertyRow>
        <PropertyRow label="MTC out"><Switch v-model="mtc" disabled aria-label="MTC out" /></PropertyRow>
        <p :class="hint">
          LTC follows the play head: it jumps with section jumps and vamps, and stops with the transport. Pick its output on the Timecode row in the
          Mixer; with none it never plays. With one hour per song, song 1 of a setlist starts at 01:00:00:00, song 2 at 02:00:00:00.
        </p>
      </section>
      <section :class="card" aria-labelledby="settings-lumen">
        <div :class="cardHeader"><h2 id="settings-lumen" :class="cardTitle">Lumen</h2></div>
        <p :class="hint">
          Lumen follows Stems through LTC. Send Timecode to an output wired (or looped back) to a Lumen audio input, and use the same frame rate in
          both apps.
        </p>
      </section>
    </div>
  </LibraryLayout>
</template>
