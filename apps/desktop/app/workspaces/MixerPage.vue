<script setup lang="ts">
import {
  addOutput,
  channelsOf,
  outputChoices,
  outputLabel,
  QUICK_SETUP_OUTPUTS,
  quickSetup,
  removeBus,
  renameBus,
  routingWarnings,
  setChannels,
  updateBus,
  type QuickSetup,
} from '@stems/core'
import type { Rig } from '@stems/schema'
import { css } from 'styled-system/css'
import { computed, onMounted } from 'vue'
import { Badge, Button, EmptyState, IconButton, Input, Menu, Panel, Select, Slider, type MenuEntry, type SelectOption } from '~/ui'
import { usePerformOptions } from '~/engine/options'
import { usePlayer } from '~/engine/player'
import LevelMeter from './mixer/LevelMeter.vue'
import { faderToGain, formatDb, gainToFader } from './mixer/levels'
import { useAudioSetup } from './mixer/useAudioSetup'

// One page for audio: the device on top, tracks with the output each plays into, and the outputs
// (the rig's buses) with the device outputs each one feeds.
const player = usePlayer()
const options = usePerformOptions()
const audio = useAudioSetup()
const rig = computed(() => player.rig.value)
const deviceChannels = computed(() => player.output.value?.channels ?? 0)
const state = computed(() => player.state.value)
const song = computed(() => player.song.value)
onMounted(() => {
  if (player.output.value) void player.refreshDevices()
})

function edit(change: (current: Rig) => Rig) {
  if (rig.value) void player.applyRig(change(rig.value))
}

// ── Tracks ──────────────────────────────────────────────────────────────────────────────────

interface Row {
  key: string
  name: string
  color: string | null
  /** Engine track index. */
  track: number
  /** Index in the song, or null for the generated click, guide and timecode. */
  songTrack: number | null
  bus: string
  gain: number
}

/** The timecode row's "off" output. */
const OFF = ''
const outputNames = computed<SelectOption<string>[]>(() => rig.value?.buses.map((bus) => ({ value: bus.name, label: bus.name })) ?? [])
function outputsFor(row: Row): SelectOption<string>[] {
  if (row.key === 'timecode') return [{ value: OFF, label: 'Off' }, ...outputNames.value]
  const known = outputNames.value.some((option) => option.value === row.bus)
  return known ? outputNames.value : [...outputNames.value, { value: row.bus, label: `${row.bus} (missing)` }]
}

const rows = computed<Row[]>(() => {
  const current = song.value
  const currentRig = rig.value
  if (!current || !currentRig) return []
  const tracks: Row[] = current.tracks.map((track, index) => ({
    key: track.id,
    name: track.name,
    color: track.color,
    track: index,
    songTrack: index,
    bus: track.defaultBus,
    gain: track.gain,
  }))
  const count = current.tracks.length
  tracks.push(
    { key: 'click', name: 'Click', color: null, track: count, songTrack: null, bus: currentRig.clickBus, gain: options.click.gain },
    { key: 'guide', name: 'Guide', color: null, track: count + 1, songTrack: null, bus: currentRig.guideBus, gain: options.guide.gain },
    { key: 'timecode', name: 'Timecode', color: null, track: count + 2, songTrack: null, bus: currentRig.timecodeBus ?? OFF, gain: options.timecode.gain },
  )
  return tracks
})

function setGain(row: Row, position: number) {
  const gain = faderToGain(position)
  if (row.songTrack !== null) void player.setTrackGain(row.songTrack, gain)
  else if (row.key === 'click') options.click.gain = gain
  else if (row.key === 'guide') options.guide.gain = gain
  else options.timecode.gain = gain
}

function setOutput(row: Row, name: string | undefined) {
  if (name === undefined) return
  if (row.songTrack !== null) void player.setTrackBus(row.songTrack, name)
  else if (row.key === 'click') edit((current) => ({ ...current, clickBus: name }))
  else if (row.key === 'guide') edit((current) => ({ ...current, guideBus: name }))
  else {
    edit((current) => ({ ...current, timecodeBus: name === OFF ? null : name }))
    options.timecode.enabled = name !== OFF
  }
}

function isMuted(row: Row): boolean {
  if (row.songTrack !== null) return player.muted.value[row.songTrack] ?? false
  if (row.key === 'click') return !options.click.enabled
  return row.key === 'guide' ? !options.guide.enabled : !options.timecode.enabled
}

function toggleMute(row: Row) {
  if (row.songTrack !== null) void player.setMute(row.songTrack, !isMuted(row))
  else if (row.key === 'click') options.click.enabled = !options.click.enabled
  else if (row.key === 'guide') options.guide.enabled = !options.guide.enabled
  else options.timecode.enabled = !options.timecode.enabled
}

// ── Outputs ─────────────────────────────────────────────────────────────────────────────────

const OFF_CHANNELS = 'off'
const choices = computed(() => outputChoices(deviceChannels.value))
function channelKey(name: string): string {
  return (rig.value ? channelsOf(rig.value, name) : []).join(',') || OFF_CHANNELS
}
function channelOptions(name: string): SelectOption<string>[] {
  const list = choices.value.map((choice) => ({ value: choice.channels.join(',') || OFF_CHANNELS, label: choice.label }))
  const key = channelKey(name)
  if (list.some((option) => option.value === key)) return list
  // A custom layout (made before this picker, or several pairs): keep it selectable as it is.
  return [{ value: key, label: outputLabel(rig.value ? channelsOf(rig.value, name) : [], deviceChannels.value) }, ...list]
}
function setChannelsFor(name: string, key: string | undefined) {
  if (key === undefined) return
  const channels = key === OFF_CHANNELS ? [] : key.split(',').map(Number)
  edit((current) => setChannels(current, name, channels))
}

/** Which generated sounds play into each output, for the chips under it. */
const roles = computed(() => {
  const current = rig.value
  const labels = new Map<string, string[]>()
  if (!current) return labels
  const add = (name: string | null, label: string) => {
    if (name) labels.set(name, [...(labels.get(name) ?? []), label])
  }
  add(current.clickBus, 'Click')
  add(current.guideBus, 'Guide')
  if (options.timecode.enabled) add(current.timecodeBus, 'Timecode')
  return labels
})

const warnings = computed(() => (rig.value ? routingWarnings(rig.value, deviceChannels.value, song.value) : []))

const setups: { id: QuickSetup; label: string; icon: string }[] = [
  { id: 'stereo', label: 'Stereo: everything on 1/2', icon: 'lucide:speaker' },
  { id: 'inEars', label: 'FOH on 1/2, in-ears and click on 3/4', icon: 'lucide:headphones' },
  { id: 'inEarsLtc', label: 'FOH, in-ears, and timecode on the last output', icon: 'lucide:clock' },
]
const setupItems = computed<MenuEntry[]>(() => [
  { type: 'label', label: 'Replaces the outputs on the right' },
  ...setups.map((setup) => ({ id: setup.id, label: setup.label, icon: setup.icon, disabled: deviceChannels.value < QUICK_SETUP_OUTPUTS[setup.id] })),
])
function runSetup(id: string) {
  const setup = id as QuickSetup
  edit((current) => quickSetup(current, setup, deviceChannels.value))
  options.timecode.enabled = setup === 'inEarsLtc'
}

const root = css({ display: 'grid', gridTemplateRows: '[auto minmax(0, 1fr)]', h: 'full', minH: '0' })
const topBar = css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap', px: '4', py: '2', borderBottomWidth: '1px', borderColor: 'border.default', bg: 'bg.panel' })
const topLabel = css({ textStyle: 'ui.label', color: 'fg.muted', textTransform: 'uppercase', mr: '1' })
const deviceSelect = css({ minW: '[240px]' })
const spacer = css({ flex: '1' })
const body = css({ display: 'grid', gridTemplateColumns: '[minmax(0, 1fr) 340px]', minH: '0' })
const main = css({ display: 'flex', flexDirection: 'column', gap: '4', minW: '0', minH: '0', p: '4', overflowY: 'auto', bg: 'bg.canvas' })
const heading = css({ textStyle: 'ui.title', color: 'fg.default' })
const hint = css({ textStyle: 'ui.sm', color: 'fg.muted' })
const table = css({ display: 'flex', flexDirection: 'column', borderRadius: 'lg', borderWidth: '1px', borderColor: 'border.default', bg: 'bg.panel' })
const row = css({
  display: 'grid',
  gridTemplateColumns: '[minmax(110px, 1fr) 140px auto minmax(120px, 1.5fr) 64px minmax(80px, 1fr)]',
  alignItems: 'center',
  gap: '3',
  px: '3',
  py: '2',
  '&:not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border.default' },
})
const nameCell = css({ display: 'flex', alignItems: 'center', gap: '2', minW: '0', textStyle: 'ui.sm', color: 'fg.default' })
const nameText = css({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const dot = css({ w: '[8px]', h: '[8px]', borderRadius: 'full', flexShrink: '0', bg: 'fg.subtle' })
const toggles = css({ display: 'flex', gap: '1' })
const db = css({ textStyle: 'ui.sm', color: 'fg.muted', fontVariantNumeric: 'tabular-nums', textAlign: 'right' })
const warningList = css({ display: 'flex', flexDirection: 'column', gap: '1', p: '3', borderRadius: 'md', borderWidth: '1px', borderColor: 'danger.default', bg: 'danger.muted' })
const warningText = css({ textStyle: 'ui.sm', color: 'fg.default' })
const outputs = css({ display: 'flex', flexDirection: 'column', gap: '3', p: '3', overflowY: 'auto' })
const outputCard = css({ display: 'flex', flexDirection: 'column', gap: '2', p: '3', borderRadius: 'lg', borderWidth: '1px', borderColor: 'border.default', bg: 'bg.canvas' })
const outputCardFoh = css({ borderColor: 'warning.default' })
const outputTop = css({ display: 'grid', gridTemplateColumns: '[1fr 96px auto auto auto]', alignItems: 'center', gap: '1' })
const outputFader = css({ display: 'grid', gridTemplateColumns: '[1fr 64px]', alignItems: 'center', gap: '2' })
const chips = css({ display: 'flex', gap: '1', flexWrap: 'wrap' })
const center = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3', h: 'full', p: '6' })
</script>

<template>
  <div v-if="!rig" :class="center">
    <EmptyState icon="lucide:audio-lines" title="No audio device open" description="Open the audio device to set up outputs, levels and meters.">
      <template #actions>
        <Button variant="primary" icon="lucide:power" @click="player.refreshDevices()">Open audio device</Button>
      </template>
    </EmptyState>
    <p v-if="player.error.value" :class="hint">{{ player.error.value }}</p>
  </div>
  <div v-else :class="root">
    <div :class="topBar">
      <span :class="topLabel">Audio</span>
      <div :class="deviceSelect">
        <Select :model-value="audio.device.value" :options="audio.deviceOptions.value" size="sm" aria-label="Audio device" @update:model-value="audio.chooseDevice" />
      </div>
      <Select :model-value="audio.rate.value" :options="audio.rateOptions.value" size="sm" aria-label="Sample rate" @update:model-value="audio.chooseRate" />
      <Select :model-value="audio.buffer.value" :options="audio.bufferOptions.value" size="sm" aria-label="Buffer size" @update:model-value="audio.chooseBuffer" />
      <Badge v-if="player.output.value" tone="success" dot :label="`${deviceChannels} outputs`" />
      <span :class="spacer" />
      <Menu :items="setupItems" aria-label="Quick setup" @select="runSetup">
        <template #trigger="{ props }">
          <Button v-bind="props" size="sm" icon="lucide:wand-sparkles">Quick setup</Button>
        </template>
      </Menu>
    </div>

    <div :class="body">
      <section :class="main" aria-label="Tracks">
        <div v-if="warnings.length" :class="warningList" role="alert">
          <Badge tone="danger" icon="lucide:triangle-alert" label="The audience could hear this" />
          <p v-for="warning in warnings" :key="warning.message" :class="warningText">{{ warning.message }}</p>
        </div>
        <p v-if="player.error.value" :class="hint">{{ player.error.value }}</p>

        <h2 :class="heading">Tracks</h2>
        <p v-if="!song" :class="hint">Load a song in Play to set its levels and outputs.</p>
        <div v-else :class="table">
          <div v-for="entry in rows" :key="entry.key" :class="row">
            <span :class="nameCell">
              <span :class="dot" :style="entry.color ? { background: entry.color } : undefined" />
              <span :class="nameText">{{ entry.name }}</span>
            </span>
            <Select
              :model-value="entry.bus"
              :options="outputsFor(entry)"
              size="sm"
              :aria-label="`${entry.name} output`"
              @update:model-value="(name: string | undefined) => setOutput(entry, name)"
            />
            <span :class="toggles">
              <IconButton icon="lucide:volume-x" :label="`Mute ${entry.name}`" size="sm" :active="isMuted(entry)" @click="toggleMute(entry)" />
              <IconButton
                v-if="entry.songTrack !== null"
                icon="lucide:headphones"
                :label="`Solo ${entry.name}`"
                size="sm"
                :active="player.soloed.value[entry.songTrack] ?? false"
                @click="player.setSolo(entry.songTrack, !player.soloed.value[entry.songTrack])"
              />
            </span>
            <Slider
              :model-value="gainToFader(entry.gain)"
              :min="0"
              :max="100"
              :aria-label="`${entry.name} level`"
              :value-text="formatDb(entry.gain)"
              @update:model-value="(position: number) => setGain(entry, position)"
            />
            <span :class="db">{{ formatDb(entry.gain) }}</span>
            <LevelMeter :peak="state?.meters[entry.track] ?? 0" :rms="state?.rms[entry.track] ?? 0" :label="`${entry.name} level`" />
          </div>
        </div>
      </section>

      <Panel title="Outputs" bordered="left">
        <template #actions>
          <IconButton icon="lucide:plus" label="Add output" size="sm" :disabled="rig.buses.length >= 16" @click="edit((current) => addOutput(current, deviceChannels))" />
        </template>
        <div :class="outputs">
          <div v-for="(bus, index) in rig.buses" :key="bus.id" :class="[outputCard, bus.foh && outputCardFoh]">
            <div :class="outputTop">
              <Input :model-value="bus.name" size="sm" :aria-label="`Output ${bus.name} name`" @update:model-value="(name: string) => edit((current) => renameBus(current, bus.name, name))" />
              <Select
                :model-value="channelKey(bus.name)"
                :options="channelOptions(bus.name)"
                size="sm"
                :aria-label="`${bus.name} device outputs`"
                @update:model-value="(key: string | undefined) => setChannelsFor(bus.name, key)"
              />
              <IconButton
                icon="lucide:users"
                :label="bus.foh ? `${bus.name}: the audience hears it` : `Mark ${bus.name} as heard by the audience`"
                size="sm"
                :active="bus.foh"
                @click="edit((current) => updateBus(current, bus.name, { foh: !bus.foh }))"
              />
              <IconButton icon="lucide:volume-x" :label="`Mute ${bus.name}`" size="sm" :active="bus.mute" @click="player.setBusMute(bus.name, !bus.mute)" />
              <IconButton icon="lucide:trash-2" :label="`Remove ${bus.name}`" size="sm" :disabled="rig.buses.length <= 1" @click="edit((current) => removeBus(current, bus.name))" />
            </div>
            <div :class="outputFader">
              <Slider
                :model-value="gainToFader(bus.gain)"
                :min="0"
                :max="100"
                :aria-label="`${bus.name} level`"
                :value-text="formatDb(bus.gain)"
                @update:model-value="(position: number) => player.setBusGain(bus.name, faderToGain(position))"
              />
              <span :class="db">{{ formatDb(bus.gain) }}</span>
            </div>
            <LevelMeter :peak="state?.busMeters[index] ?? 0" :rms="state?.busRms[index] ?? 0" :label="`${bus.name} level`" />
            <div v-if="bus.foh || roles.get(bus.name)" :class="chips">
              <Badge v-if="bus.foh" tone="warning" label="Audience" />
              <Badge v-for="role in roles.get(bus.name) ?? []" :key="role" :label="role" />
            </div>
          </div>
          <p :class="hint">Pick where each output goes on the device. Pairs play in stereo; a single output gets a mono mix.</p>
        </div>
      </Panel>
    </div>
  </div>
</template>
