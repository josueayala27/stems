<script setup lang="ts">
import { channelTargets, channelsOf, formatTargets, routingWarnings, setChannels, toggleChannel } from '@stems/core'
import { css } from 'styled-system/css'
import { computed } from 'vue'
import { Badge, Button, Checkbox, EmptyState, IconButton, Panel, PanelSection, Select, Slider, type SelectOption } from '~/ui'
import { usePerformOptions } from '~/engine/options'
import { usePlayer } from '~/engine/player'
import LevelMeter from './mixer/LevelMeter.vue'
import { faderToGain, formatDb, gainToFader } from './mixer/levels'

// Tracks on the left with their bus, fader and meter; the routing matrix below them; buses on the right.
const player = usePlayer()
const options = usePerformOptions()
const rig = computed(() => player.rig.value)
const deviceChannels = computed(() => player.output.value?.channels ?? 0)
const state = computed(() => player.state.value)
const song = computed(() => player.song.value)

const busOptions = computed<SelectOption<string>[]>(() => rig.value?.buses.map((bus) => ({ value: bus.name, label: bus.name })) ?? [])
function optionsFor(name: string): SelectOption<string>[] {
  if (!name) return [{ value: '', label: 'No LTC bus' }, ...busOptions.value]
  return busOptions.value.some((option) => option.value === name) ? busOptions.value : [...busOptions.value, { value: name, label: `${name} (not in rig)` }]
}

interface Row {
  key: string
  name: string
  color: string | null
  /** Engine track index. */
  track: number
  /** Index in the song, or null for the generated click and guide. */
  songTrack: number | null
  bus: string
  gain: number
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
  )
  if (options.timecode.enabled) {
    tracks.push({ key: 'timecode', name: 'Timecode', color: null, track: count + 2, songTrack: null, bus: currentRig.timecodeBus ?? '', gain: options.timecode.gain })
  }
  return tracks
})

function setGain(row: Row, position: number) {
  const gain = faderToGain(position)
  if (row.songTrack !== null) void player.setTrackGain(row.songTrack, gain)
  else if (row.key === 'click') options.click.gain = gain
  else if (row.key === 'guide') options.guide.gain = gain
  else options.timecode.gain = gain
}

function setBus(row: Row, name: string) {
  const currentRig = rig.value
  if (!currentRig) return
  if (row.songTrack !== null) void player.setTrackBus(row.songTrack, name)
  else if (row.key === 'click') void player.applyRig({ ...currentRig, clickBus: name })
  else if (row.key === 'guide') void player.applyRig({ ...currentRig, guideBus: name })
  else void player.applyRig({ ...currentRig, timecodeBus: name })
}

function toggleMute(row: Row) {
  if (row.songTrack !== null) void player.setMute(row.songTrack, !player.muted.value[row.songTrack])
  else if (row.key === 'click') options.click.enabled = !options.click.enabled
  else if (row.key === 'guide') options.guide.enabled = !options.guide.enabled
  else options.timecode.enabled = false
}

function isMuted(row: Row): boolean {
  if (row.songTrack !== null) return player.muted.value[row.songTrack] ?? false
  if (row.key === 'click') return !options.click.enabled
  return row.key === 'guide' ? !options.guide.enabled : !options.timecode.enabled
}

const channels = computed(() => Array.from({ length: deviceChannels.value }, (_, index) => index))
const warnings = computed(() => (rig.value ? routingWarnings(rig.value, deviceChannels.value, song.value) : []))

function routed(bus: string, channel: number): boolean {
  return rig.value ? channelsOf(rig.value, bus).includes(channel) : false
}

function toggleRoute(bus: string, channel: number) {
  const currentRig = rig.value
  if (!currentRig) return
  void player.applyRig(setChannels(currentRig, bus, toggleChannel(channelsOf(currentRig, bus), channel)))
}

const root = css({ display: 'grid', gridTemplateColumns: '[minmax(0, 1fr) 320px]', h: 'full', minH: '0' })
const main = css({ display: 'flex', flexDirection: 'column', gap: '5', minW: '0', minH: '0', p: '4', overflowY: 'auto', bg: 'bg.canvas' })
const heading = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2', textStyle: 'ui.title', color: 'fg.default' })
const hint = css({ textStyle: 'ui.sm', color: 'fg.muted' })
const table = css({ display: 'flex', flexDirection: 'column', borderRadius: 'lg', borderWidth: '1px', borderColor: 'border.default', bg: 'bg.panel' })
const row = css({
  display: 'grid',
  gridTemplateColumns: '[minmax(120px, 1.2fr) 140px auto minmax(120px, 1.5fr) 64px minmax(80px, 1fr)]',
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
const matrixScroll = css({ overflowX: 'auto', borderRadius: 'lg', borderWidth: '1px', borderColor: 'border.default', bg: 'bg.panel' })
const matrix = css({ borderCollapse: 'collapse', textStyle: 'ui.sm' })
const busHeader = css({ textAlign: 'left', px: '3', py: '1', color: 'fg.default', fontWeight: 'medium', whiteSpace: 'nowrap' })
const channelHeader = css({ textAlign: 'center', px: '1', py: '1', color: 'fg.muted', fontVariantNumeric: 'tabular-nums', minW: '[28px]' })
const cell = css({ textAlign: 'center', px: '1', py: '1' })
const targetsCell = css({ textAlign: 'left', px: '3', py: '1', color: 'fg.muted', whiteSpace: 'nowrap' })
const busStrip = css({ display: 'flex', flexDirection: 'column', gap: '2', py: '3', '&:not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border.default' } })
const busTop = css({ display: 'flex', alignItems: 'center', gap: '2', textStyle: 'ui.sm', color: 'fg.default' })
const busName = css({ flex: '1', minW: '0', fontWeight: 'medium' })
const busFader = css({ display: 'grid', gridTemplateColumns: '[1fr 64px]', alignItems: 'center', gap: '2' })
const center = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3', h: 'full', p: '6' })
</script>

<template>
  <div v-if="!rig" :class="center">
    <EmptyState icon="lucide:audio-lines" title="No audio device open" description="Open the audio device to load your rig: its buses, faders and routing.">
      <template #actions>
        <Button variant="primary" icon="lucide:power" @click="player.refreshDevices()">Open audio device</Button>
      </template>
    </EmptyState>
    <p v-if="player.error.value" :class="hint">{{ player.error.value }}</p>
  </div>
  <div v-else :class="root">
    <section :class="main" aria-label="Tracks and routing">
      <div v-if="warnings.length" :class="warningList" role="alert">
        <Badge tone="danger" icon="lucide:triangle-alert" label="Front of house" />
        <p v-for="warning in warnings" :key="warning.message" :class="warningText">{{ warning.message }}</p>
      </div>

      <div>
        <h2 :class="heading">
          Tracks
          <Badge v-if="player.output.value" :label="`${player.output.value.name} · ${deviceChannels} out`" />
        </h2>
        <p v-if="!song" :class="hint">Load a song in Play to set its faders and buses.</p>
      </div>
      <div v-if="song" :class="table">
        <div v-for="entry in rows" :key="entry.key" :class="row">
          <span :class="nameCell">
            <span :class="dot" :style="entry.color ? { background: entry.color } : undefined" />
            <span :class="nameText">{{ entry.name }}</span>
          </span>
          <Select
            :model-value="entry.bus"
            :options="optionsFor(entry.bus)"
            size="sm"
            :aria-label="`${entry.name} bus`"
            @update:model-value="(name: string | undefined) => name && setBus(entry, name)"
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

      <div>
        <h2 :class="heading">Routing</h2>
        <p :class="hint">Tick the outputs each bus feeds. Pairs play in stereo (left, right); a last odd output gets the mono fold.</p>
      </div>
      <div v-if="deviceChannels" :class="matrixScroll">
        <table :class="matrix">
          <thead>
            <tr>
              <th :class="busHeader" scope="col">Bus</th>
              <th v-for="channel in channels" :key="channel" :class="channelHeader" scope="col">{{ channel + 1 }}</th>
              <th :class="targetsCell" scope="col">Plays as</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bus in rig.buses" :key="bus.id">
              <th :class="busHeader" scope="row">{{ bus.name }}</th>
              <td v-for="channel in channels" :key="channel" :class="cell">
                <Checkbox :model-value="routed(bus.name, channel)" :aria-label="`${bus.name} to output ${channel + 1}`" @update:model-value="toggleRoute(bus.name, channel)" />
              </td>
              <td :class="targetsCell">{{ formatTargets(channelTargets(channelsOf(rig, bus.name), deviceChannels)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Panel :title="rig.name" bordered="left">
      <PanelSection title="Buses">
        <div v-for="(bus, index) in rig.buses" :key="bus.id" :class="busStrip">
          <div :class="busTop">
            <span :class="busName">{{ bus.name }}</span>
            <Badge v-if="bus.foh" tone="warning" label="FOH" />
            <IconButton icon="lucide:volume-x" :label="`Mute ${bus.name}`" size="sm" :active="bus.mute" @click="player.setBusMute(bus.name, !bus.mute)" />
          </div>
          <div :class="busFader">
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
          <span :class="hint">{{ formatTargets(channelTargets(channelsOf(rig, bus.name), deviceChannels)) }}</span>
        </div>
      </PanelSection>
    </Panel>
  </div>
</template>
