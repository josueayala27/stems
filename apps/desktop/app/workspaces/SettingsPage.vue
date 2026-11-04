<script setup lang="ts">
import { addBus, removeBus, renameBus, routingWarnings, updateBus } from '@stems/core'
import type { Rig } from '@stems/schema'
import { css } from 'styled-system/css'
import { computed, onMounted, ref } from 'vue'
import { Badge, Button, IconButton, Input, PropertyRow, Select, Slider, Switch, type SelectOption } from '~/ui'
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

/** The engine's default-device id stands in for `deviceId: null`. */
const DEFAULT_DEVICE = ''
const deviceOptions = computed<SelectOption<string>[]>(() => [
  { value: DEFAULT_DEVICE, label: 'System default output' },
  ...player.devices.value.map((device) => ({ value: device.id, label: `${device.name} · ${device.channels} out` })),
])
const selectedDevice = computed(() => {
  const id = rig.value?.deviceId
  return player.devices.value.find((device) => (id ? device.id === id : device.isDefault)) ?? null
})
/** 0 stands for the device's default rate. */
const rateOptions = computed<SelectOption<number>[]>(() => [
  { value: 0, label: selectedDevice.value?.defaultSampleRate ? `Device default (${selectedDevice.value.defaultSampleRate / 1000} kHz)` : 'Device default' },
  ...(selectedDevice.value?.sampleRates ?? [44_100, 48_000, 96_000]).map((value) => ({ value, label: `${value / 1000} kHz` })),
])
const BUFFERS = [64, 128, 256, 512, 1024] as const
const bufferOptions = computed<SelectOption<number>[]>(() =>
  BUFFERS.filter((value) => {
    const device = selectedDevice.value
    return (!device?.minBuffer || value >= device.minBuffer) && (!device?.maxBuffer || value <= device.maxBuffer)
  }).map((value) => ({ value, label: `${value} samples · ${((value / (output.value?.sampleRate || 48_000)) * 1000).toFixed(1)} ms` })),
)

function apply(next: Rig) {
  void player.applyRig(next)
}
function chooseDevice(id: string | undefined) {
  const current = rig.value
  if (!current || id === undefined) return
  const device = player.devices.value.find((entry) => entry.id === id)
  apply({ ...current, deviceId: id === DEFAULT_DEVICE ? null : id, device: device?.name ?? '' })
}
function chooseRate(rate: number | undefined) {
  if (rig.value && rate !== undefined) apply({ ...rig.value, sampleRate: rate === 0 ? null : rate })
}
function chooseBuffer(size: number | undefined) {
  if (rig.value && size !== undefined) apply({ ...rig.value, bufferSize: size as Rig['bufferSize'] })
}

const rigOptions = computed<SelectOption<string>[]>(() => player.rigs.value.map((entry) => ({ value: entry.id, label: entry.name })))
const busNames = computed<SelectOption<string>[]>(() => rig.value?.buses.map((bus) => ({ value: bus.name, label: bus.name })) ?? [])
const warnings = computed(() => (rig.value ? routingWarnings(rig.value, output.value?.channels) : []))
function edit(change: (current: Rig) => Rig) {
  if (rig.value) apply(change(rig.value))
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
const link = ref(false)
const mtc = ref(false)

const frameRates: SelectOption<FrameRate>[] = [
  { value: '23.976', label: '23.976 fps' },
  { value: '24', label: '24 fps' },
  { value: '25', label: '25 fps' },
  { value: '29.97', label: '29.97 fps' },
  { value: '29.97df', label: '29.97 drop-frame' },
  { value: '30', label: '30 fps' },
]
/** The empty value stands for "no timecode bus". */
const NO_BUS = ''
const timecodeBuses = computed<SelectOption<string>[]>(() => [{ value: NO_BUS, label: 'None (LTC off)' }, ...busNames.value])
const startInvalid = ref(false)
function setStart(text: string) {
  startInvalid.value = !validTimecode(text, options.timecode.rate)
  if (!startInvalid.value) options.timecode.start = text.trim()
}
function setTimecodeBus(name: string | undefined) {
  if (name !== undefined) edit((current) => ({ ...current, timecodeBus: name === NO_BUS ? null : name }))
}

const grid = css({ display: 'grid', gridTemplateColumns: '[repeat(auto-fill, minmax(360px, 1fr))]', gap: '4' })
const card = css({ display: 'flex', flexDirection: 'column', gap: '3', p: '4', borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default' })
const cardHeader = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2' })
const cardTitle = css({ textStyle: 'ui.title', color: 'fg.default' })
const hint = css({ textStyle: 'ui.sm', color: 'fg.muted' })
const danger = css({ textStyle: 'ui.sm', color: 'danger.default' })
const busList = css({ display: 'flex', flexDirection: 'column', gap: '2', alignItems: 'flex-start' })
const busRow = css({ display: 'grid', gridTemplateColumns: '[1fr auto auto auto]', alignItems: 'center', gap: '2', w: 'full' })
</script>

<template>
  <LibraryLayout>
    <PageHeader eyebrow="System" title="Settings" subtitle="Audio device, rig, MIDI, Link, timecode and Lumen." />
    <div :class="grid">
      <section :class="card" aria-labelledby="settings-audio">
        <div :class="cardHeader">
          <h2 id="settings-audio" :class="cardTitle">Audio device</h2>
          <Badge v-if="output" tone="success" dot :label="`${output.channels} out · ${output.sampleRate / 1000} kHz · ${output.bufferSize}`" />
          <Badge v-else tone="warning" dot label="Not connected" />
        </div>
        <PropertyRow label="Device">
          <Select :model-value="rig?.deviceId ?? DEFAULT_DEVICE" :options="deviceOptions" :disabled="!rig" aria-label="Audio device" @update:model-value="chooseDevice" />
        </PropertyRow>
        <PropertyRow label="Sample rate">
          <Select :model-value="rig?.sampleRate ?? 0" :options="rateOptions" :disabled="!rig" aria-label="Sample rate" @update:model-value="chooseRate" />
        </PropertyRow>
        <PropertyRow label="Buffer">
          <Select :model-value="rig?.bufferSize" :options="bufferOptions" :disabled="!rig" aria-label="Buffer size" @update:model-value="chooseBuffer" />
        </PropertyRow>
        <p v-if="player.error.value" :class="hint">{{ player.error.value }}</p>
        <p :class="hint">
          To play through several interfaces as one, combine them in Audio MIDI Setup: click +, choose Create Aggregate Device and tick each interface.
          It shows up here as one device with all of their outputs. Turn on drift correction for every interface except the clock source.
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
      <section :class="card" aria-labelledby="settings-rig">
        <div :class="cardHeader">
          <h2 id="settings-rig" :class="cardTitle">Rig</h2>
          <Button size="sm" icon="lucide:plus" :disabled="!output" @click="player.newRig()">New rig</Button>
        </div>
        <p :class="hint">Buses and their output channels, saved on this machine. Routing belongs to the rig, so every song plays through the same outputs. Map channels in the Mixer.</p>
        <PropertyRow label="Rig">
          <Select :model-value="rig?.id" :options="rigOptions" placeholder="No rigs" :disabled="!rig" aria-label="Rig" @update:model-value="(id: string | undefined) => id && player.selectRig(id)" />
        </PropertyRow>
        <template v-if="rig">
          <PropertyRow label="Name">
            <Input :model-value="rig.name" aria-label="Rig name" @update:model-value="(name: string) => name.trim() && edit((current) => ({ ...current, name: name.trim() }))" />
          </PropertyRow>
          <div :class="busList">
            <div v-for="bus in rig.buses" :key="bus.id" :class="busRow">
              <Input :model-value="bus.name" size="sm" :aria-label="`Bus ${bus.name} name`" @update:model-value="(name: string) => edit((current) => renameBus(current, bus.name, name))" />
              <Switch :model-value="bus.foh" size="sm" :aria-label="`${bus.name} is front of house`" @update:model-value="(foh: boolean) => edit((current) => updateBus(current, bus.name, { foh }))" />
              <span :class="hint">FOH</span>
              <IconButton icon="lucide:trash-2" :label="`Remove ${bus.name}`" size="sm" :disabled="rig.buses.length <= 1" @click="edit((current) => removeBus(current, bus.name))" />
            </div>
            <Button size="sm" icon="lucide:plus" :disabled="rig.buses.length >= 16" @click="edit((current) => addBus(current))">Add bus</Button>
          </div>
          <PropertyRow label="Click bus">
            <Select :model-value="rig.clickBus" :options="busNames" aria-label="Click bus" @update:model-value="(name: string | undefined) => name && edit((current) => ({ ...current, clickBus: name }))" />
          </PropertyRow>
          <PropertyRow label="Guide bus">
            <Select :model-value="rig.guideBus" :options="busNames" aria-label="Guide bus" @update:model-value="(name: string | undefined) => name && edit((current) => ({ ...current, guideBus: name }))" />
          </PropertyRow>
          <PropertyRow label="Pad bus">
            <Select :model-value="rig.padBus" :options="busNames" aria-label="Pad bus" @update:model-value="(name: string | undefined) => name && edit((current) => ({ ...current, padBus: name }))" />
          </PropertyRow>
          <p v-for="warning in warnings" :key="warning.message" :class="danger" role="alert">{{ warning.message }}</p>
        </template>
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
        <div :class="cardHeader">
          <h2 id="settings-timecode" :class="cardTitle">Timecode</h2>
          <Switch v-model="options.timecode.enabled" aria-label="LTC out" />
        </div>
        <PropertyRow label="LTC bus">
          <Select :model-value="rig?.timecodeBus ?? NO_BUS" :options="timecodeBuses" :disabled="!rig" aria-label="LTC bus" @update:model-value="setTimecodeBus" />
        </PropertyRow>
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
          LTC follows the play head: it jumps with section jumps and vamps, and stops with the transport. Give it a bus of its own on a spare output;
          it never plays when no LTC bus is set. With one hour per song, song 1 of a setlist starts at 01:00:00:00, song 2 at 02:00:00:00.
        </p>
      </section>
      <section :class="card" aria-labelledby="settings-lumen">
        <div :class="cardHeader"><h2 id="settings-lumen" :class="cardTitle">Lumen</h2></div>
        <p :class="hint">
          Lumen follows Stems through LTC. Route the LTC bus to an output wired (or looped back) to a Lumen audio input, and use the same frame rate in
          both apps.
        </p>
      </section>
    </div>
  </LibraryLayout>
</template>
