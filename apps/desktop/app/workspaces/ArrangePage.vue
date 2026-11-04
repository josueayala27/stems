<script setup lang="ts">
// Arrange: sections and markers on the song's waveform, every boundary on a bar line.
import type { CueEvent, Marker, Section, Song } from '@stems/schema'
import { css } from 'styled-system/css'
import { NuxtLink } from '#components'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { Badge, Button, EmptyState, IconButton, Input, NumberField, Panel, PanelSection, Select, Switch, type SelectOption } from '~/ui'
import type { Peaks } from '~/audio/peaks'
import Waveform from '~/audio/Waveform.vue'
import { library } from '~/data/library'
import { getSong, saveSong } from '~/data/songs'
import { usePlayer } from '~/engine/player'
import { addMarker, appendSection, barAt, barCount, barStart, gridFor, SECTION_COLORS, setSectionBars, setTempo, snapToBar, splitAt } from './arrange/arrangement'
import { anchorFromKey, anchorKey, anchorOptions, cueSample, isMidiCue, MIDI_KINDS, newCue, noteName, removeMarker, updateCue, withKind, type MidiKind } from './arrange/cues'

const props = defineProps<{ songId: string }>()
const player = usePlayer()

const song = ref<Song | null>(null)
const loading = ref(true)
const dirty = ref(false)
const saving = ref(false)
const message = ref<string | null>(null)
const cursor = ref(0)
const overview = shallowRef<Peaks | null>(null)
const overviewColor = ref('blue')

const newId = () => crypto.randomUUID()

onMounted(async () => {
  if (player.output.value) void player.refreshMidi()
  song.value = await getSong(props.songId).catch(() => null)
  loading.value = false
  // The overview shows the first stem (click and guide are not music to look at).
  const track = song.value?.tracks.find((entry) => entry.kind === 'stem') ?? song.value?.tracks[0]
  if (track) {
    overviewColor.value = track.color
    overview.value = await library.peaks(track.hash).catch(() => null)
  }
})

const grid = computed(() => (song.value ? gridFor(song.value) : null))
const bars = computed(() => (song.value ? barCount(song.value) : 0))
const cursorBar = computed(() => (grid.value ? barAt(grid.value, cursor.value) : 1))

function edit(change: (current: Song) => Song) {
  if (!song.value) return
  song.value = change(song.value)
  dirty.value = true
  message.value = null
}

function percent(sample: number): number {
  return song.value && song.value.durationSamples > 0 ? (sample / song.value.durationSamples) * 100 : 0
}

/** Bar numbers to label on the ruler, about every 40 px of a 1000 px timeline. */
const rulerBars = computed(() => {
  if (!grid.value || !bars.value) return []
  const step = Math.max(1, Math.ceil(bars.value / 25))
  const list: { bar: number; left: number }[] = []
  for (let bar = 1; bar <= bars.value; bar += step) list.push({ bar, left: percent(barStart(grid.value, bar)) })
  return list
})

function place(event: MouseEvent) {
  if (!song.value || !grid.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  cursor.value = snapToBar(grid.value, ratio * song.value.durationSamples)
}

function updateSection(id: string, patch: Partial<Section>) {
  edit((current) => ({ ...current, sections: current.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)) }))
}

function updateMarker(id: string, patch: Partial<Marker>) {
  edit((current) => ({ ...current, markers: current.markers.map((marker) => (marker.id === id ? { ...marker, ...patch } : marker)) }))
}

function sectionBars(section: Section) {
  if (!grid.value) return { start: 1, end: 2 }
  const start = barAt(grid.value, section.startSample)
  // The end is exclusive: the section stops where `end` starts.
  const endBar = barAt(grid.value, Math.max(section.startSample, section.endSample - 1)) + 1
  return { start, end: endBar }
}

const colorOptions: SelectOption[] = SECTION_COLORS.map((color) => ({ value: color, label: color[0]!.toUpperCase() + color.slice(1) }))
const actionOptions: SelectOption<Marker['action']>[] = [
  { value: 'stop', label: 'Stop' },
  { value: 'loop', label: 'Loop section' },
  { value: 'next', label: 'Next song' },
  { value: 'none', label: 'None' },
]
const numeratorOptions: SelectOption<number>[] = [2, 3, 4, 5, 6, 7, 9, 12].map((value) => ({ value, label: String(value) }))
const denominatorOptions: SelectOption<number>[] = [2, 4, 8, 16].map((value) => ({ value, label: String(value) }))

function changeTempo(bpm: number, numerator: number, denominator: number) {
  edit((current) => setTempo(current, bpm, numerator, denominator as 2 | 4 | 8 | 16))
}

// ── Cue events ──────────────────────────────────────────────────────────────────────────────

const NO_MIDI = ''
const midiOptions = computed<SelectOption<string>[]>(() => {
  const ports = player.midiPorts.value.map((port) => ({ value: port, label: port === 'Stems' ? 'Stems (virtual, this Mac)' : port }))
  const current = player.rig.value?.midiOutput
  const missing = current && !player.midiPorts.value.includes(current) ? [{ value: current, label: `${current} (not connected)` }] : []
  return [{ value: NO_MIDI, label: 'MIDI off' }, ...ports, ...missing]
})
function setMidiOutput(port: string | undefined) {
  const current = player.rig.value
  if (current && port !== undefined) void player.applyRig({ ...current, midiOutput: port === NO_MIDI ? null : port })
}

const cues = computed(() => (song.value ? [...song.value.events].filter(isMidiCue).sort((a, b) => cueSample(song.value!, a) - cueSample(song.value!, b)) : []))
function barLabel(sample: number): string {
  return grid.value ? `Bar ${barAt(grid.value, sample)}` : 'Song start'
}
function addCueAtCursor() {
  edit((current) => ({ ...current, events: [...current.events, newCue({ kind: 'sample', sample: cursor.value }, newId)] }))
}
function setCueAnchor(cue: CueEvent, key: string | undefined) {
  const at = key ? anchorFromKey(key) : null
  if (at) edit((current) => updateCue(current, cue.id, { at }))
}
function setCueKind(cue: CueEvent, kind: MidiKind | undefined) {
  if (kind && isMidiCue(cue)) edit((current) => updateCue(current, cue.id, { action: withKind(cue.action, kind) }))
}
function setCueField(cue: CueEvent, field: string, value: number) {
  if (!Number.isFinite(value)) return
  edit((current) => updateCue(current, cue.id, { action: { ...cue.action, [field]: Math.round(value) } as CueEvent['action'] }))
}

async function save() {
  if (!song.value) return
  saving.value = true
  try {
    await saveSong(song.value)
    dirty.value = false
    const applied = await player.updateSong(song.value)
    message.value = applied ? 'Saved.' : 'Saved. The changes play the next time this song loads.'
  } catch (cause) {
    message.value = String(cause)
  } finally {
    saving.value = false
  }
}

const root = css({ display: 'flex', flexDirection: 'column', h: 'full', minH: '0' })
const header = css({ display: 'flex', alignItems: 'center', gap: '3', minH: '[52px]', px: '4', flexShrink: '0', bg: 'bg.panel', borderBottomWidth: '1px', borderColor: 'border.default', flexWrap: 'wrap' })
const titleClass = css({ textStyle: 'ui.title', color: 'fg.default' })
const spacer = css({ flex: '1' })
const tempo = css({ display: 'flex', alignItems: 'center', gap: '2', w: '[300px]' })
const body = css({ flex: '1', minH: '0', display: 'grid', gridTemplateColumns: '[1fr 340px]' })
const timeline = css({ display: 'flex', flexDirection: 'column', minW: '0', minH: '0', p: '4', gap: '2', bg: 'bg.canvas', overflowY: 'auto' })
const track = css({ position: 'relative', w: 'full', cursor: 'crosshair' })
const ruler = css({ position: 'relative', h: '[20px]', textStyle: 'ui.xs', color: 'fg.subtle', fontFamily: 'mono' })
const rulerMark = css({ position: 'absolute', top: '0', borderLeftWidth: '1px', borderColor: 'border.default', pl: '1', h: 'full' })
const wave = css({ borderRadius: 'md', bg: 'bg.input', overflow: 'hidden' })
const lane = css({ position: 'relative', h: '[44px]', borderRadius: 'md', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default' })
const sectionBlock = css({
  position: 'absolute',
  top: '1',
  bottom: '1',
  display: 'flex',
  alignItems: 'center',
  px: '2',
  borderRadius: 'sm',
  textStyle: 'ui.xs',
  color: 'fg.default',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
})
const markerPin = css({ position: 'absolute', top: '0', bottom: '0', w: '[2px]', bg: 'warning.default' })
const markerLabel = css({ position: 'absolute', top: '1', left: '1', textStyle: 'ui.xs', color: 'warning.default', whiteSpace: 'nowrap' })
const cursorLine = css({ position: 'absolute', top: '0', bottom: '0', w: '[2px]', bg: 'accent.default', pointerEvents: 'none' })
const actions = css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })
const hint = css({ textStyle: 'ui.sm', color: 'fg.muted' })
const editor = css({ display: 'flex', flexDirection: 'column', gap: '2', py: '2', borderBottomWidth: '1px', borderColor: 'border.default', _last: { borderBottomWidth: '0' } })
const editorRow = css({ display: 'flex', alignItems: 'center', gap: '2' })
const swatch = css({ w: '3', h: '3', borderRadius: 'full', flexShrink: '0' })
const center = css({ flex: '1', display: 'grid', placeItems: 'center' })
const statusText = css({ textStyle: 'ui.sm', color: 'fg.muted' })
</script>

<template>
  <div :class="root">
    <header :class="header">
      <NuxtLink to="/arrange"><Button variant="ghost" size="sm" icon="lucide:arrow-left" tabindex="-1">Songs</Button></NuxtLink>
      <span :class="titleClass">{{ song?.title ?? 'Untitled song' }}</span>
      <Badge v-if="!loading && !song" tone="warning" label="Not in library" />
      <span :class="spacer" />
      <div v-if="song" :class="tempo">
        <NumberField
          :model-value="String(song.bpm)"
          :min="1"
          :max="999"
          :decimals="2"
          label="BPM"
          size="sm"
          @update:model-value="(value: string) => changeTempo(Number(value), song!.timeSignature.numerator, song!.timeSignature.denominator)"
        />
        <Select
          :model-value="song.timeSignature.numerator"
          :options="numeratorOptions"
          size="sm"
          aria-label="Beats per bar"
          @update:model-value="(value?: number) => value && changeTempo(song!.bpm, value, song!.timeSignature.denominator)"
        />
        <Select
          :model-value="song.timeSignature.denominator"
          :options="denominatorOptions"
          size="sm"
          aria-label="Beat unit"
          @update:model-value="(value?: number) => value && changeTempo(song!.bpm, song!.timeSignature.numerator, value)"
        />
      </div>
      <span :class="statusText" role="status">{{ message }}</span>
      <Button v-if="song" icon="lucide:play" @click="player.play(song)">Play</Button>
      <Button v-if="song" variant="primary" :loading="saving" :disabled="!dirty" @click="save">Save</Button>
    </header>

    <div v-if="song" :class="body">
      <section :class="timeline" aria-label="Arrangement">
        <div :class="[track, ruler]" @click="place">
          <span v-for="mark in rulerBars" :key="mark.bar" :class="rulerMark" :style="{ left: `${mark.left}%` }">{{ mark.bar }}</span>
        </div>
        <div :class="[track, wave]" @click="place">
          <Waveform :peaks="overview" :color="overviewColor" :height="96" aria-label="Song waveform" />
          <span :class="cursorLine" :style="{ left: `${percent(cursor)}%` }" />
        </div>
        <div :class="[track, lane]" aria-label="Sections lane" @click="place">
          <span
            v-for="section in song.sections"
            :key="section.id"
            :class="sectionBlock"
            :style="{
              left: `${percent(section.startSample)}%`,
              width: `${percent(section.endSample - section.startSample)}%`,
              background: `var(--colors-track-${section.color})`,
            }"
            :title="section.name"
          >{{ section.name }}</span>
          <span :class="cursorLine" :style="{ left: `${percent(cursor)}%` }" />
        </div>
        <div :class="[track, lane]" aria-label="Markers lane" @click="place">
          <span v-for="marker in song.markers" :key="marker.id" :class="markerPin" :style="{ left: `${percent(marker.sample)}%` }">
            <span :class="markerLabel">{{ marker.name }}</span>
          </span>
          <span :class="cursorLine" :style="{ left: `${percent(cursor)}%` }" />
        </div>
        <div :class="actions">
          <span :class="hint">Cursor at bar {{ cursorBar }} of {{ bars }}. Click the timeline to move it.</span>
          <span :class="spacer" />
          <Button size="sm" icon="lucide:plus" @click="edit((s) => ({ ...s, sections: appendSection(s, newId) }))">Add section</Button>
          <Button size="sm" icon="lucide:scissors" :disabled="!song.sections.length" @click="edit((s) => ({ ...s, sections: splitAt(s, cursor, newId) }))">Split at cursor</Button>
          <Button size="sm" icon="lucide:map-pin" @click="edit((s) => ({ ...s, markers: addMarker(s, cursor, newId) }))">Marker at cursor</Button>
        </div>
      </section>

      <Panel title="Arrangement" bordered="left">
        <PanelSection title="Sections" collapsible storage-key="arrange.sections">
          <EmptyState v-if="!song.sections.length" title="No sections" description="Add sections to jump between them and vamp them live." size="sm" />
          <div v-for="section in song.sections" :key="section.id" :class="editor">
            <div :class="editorRow">
              <span :class="swatch" :style="{ background: `var(--colors-track-${section.color})` }" />
              <Input :model-value="section.name" size="sm" aria-label="Section name" @update:model-value="(name: string) => updateSection(section.id, { name: name || 'Section' })" />
              <IconButton icon="lucide:trash-2" label="Delete section" size="sm" @click="edit((s) => ({ ...s, sections: s.sections.filter((x) => x.id !== section.id) }))" />
            </div>
            <div :class="editorRow">
              <NumberField
                :model-value="String(sectionBars(section).start)"
                :min="1"
                :max="bars"
                :decimals="0"
                label="Bar"
                size="sm"
                @update:model-value="(value: string) => edit((s) => ({ ...s, sections: setSectionBars(s, section.id, Number(value), sectionBars(section).end + Number(value) - sectionBars(section).start) }))"
              />
              <NumberField
                :model-value="String(sectionBars(section).end - sectionBars(section).start)"
                :min="1"
                :max="bars"
                :decimals="0"
                label="Bars"
                size="sm"
                @update:model-value="(value: string) => edit((s) => ({ ...s, sections: setSectionBars(s, section.id, sectionBars(section).start, sectionBars(section).start + Math.max(1, Number(value))) }))"
              />
            </div>
            <div :class="editorRow">
              <Select :model-value="section.color" :options="colorOptions" size="sm" aria-label="Colour" @update:model-value="(color?: string) => color && updateSection(section.id, { color })" />
              <Switch :model-value="section.loopable" aria-label="Can vamp" @update:model-value="(loopable: boolean) => updateSection(section.id, { loopable })" />
              <span :class="hint">Vamp</span>
            </div>
          </div>
        </PanelSection>
        <PanelSection title="Markers" collapsible storage-key="arrange.markers">
          <EmptyState v-if="!song.markers.length" title="No markers" description="Cue points with actions: stop, loop or next." size="sm" />
          <div v-for="marker in song.markers" :key="marker.id" :class="editor">
            <div :class="editorRow">
              <Input :model-value="marker.name" size="sm" aria-label="Marker name" @update:model-value="(name: string) => updateMarker(marker.id, { name })" />
              <IconButton icon="lucide:trash-2" label="Delete marker" size="sm" @click="edit((s) => removeMarker(s, marker.id))" />
            </div>
            <div :class="editorRow">
              <NumberField
                :model-value="String(grid ? barAt(grid, marker.sample) : 1)"
                :min="1"
                :max="bars"
                :decimals="0"
                label="Bar"
                size="sm"
                @update:model-value="(value: string) => grid && updateMarker(marker.id, { sample: Math.min(barStart(grid, Number(value)), Math.max(0, song!.durationSamples - 1)) })"
              />
              <Select :model-value="marker.action" :options="actionOptions" size="sm" aria-label="Action" @update:model-value="(action?: Marker['action']) => action && updateMarker(marker.id, { action })" />
            </div>
          </div>
        </PanelSection>
        <PanelSection title="MIDI cues" collapsible storage-key="arrange.events">
          <template #actions>
            <IconButton icon="lucide:plus" label="Add a MIDI cue at the cursor" size="sm" @click="addCueAtCursor" />
          </template>
          <div :class="editorRow">
            <Select
              v-if="player.rig.value"
              :model-value="player.rig.value.midiOutput ?? NO_MIDI"
              :options="midiOptions"
              size="sm"
              aria-label="MIDI output"
              @update:model-value="setMidiOutput"
            />
            <Button v-else size="sm" icon="lucide:cable" @click="player.refreshMidi()">Connect MIDI</Button>
          </div>
          <EmptyState v-if="!cues.length" title="No MIDI cues" description="Change a synth patch at the song start, or send a note or CC at a section or marker." size="sm" />
          <div v-for="cue in cues" :key="cue.id" :class="editor">
            <div :class="editorRow">
              <Select
                :model-value="anchorKey(cue.at)"
                :options="anchorOptions(song, cue.at, barLabel)"
                size="sm"
                aria-label="When"
                @update:model-value="(key: string | undefined) => setCueAnchor(cue, key)"
              />
              <IconButton icon="lucide:trash-2" label="Delete cue" size="sm" @click="edit((s) => ({ ...s, events: s.events.filter((x) => x.id !== cue.id) }))" />
            </div>
            <div v-if="isMidiCue(cue)" :class="editorRow">
              <Select :model-value="cue.action.kind" :options="MIDI_KINDS" size="sm" aria-label="Message" @update:model-value="(kind?: MidiKind) => setCueKind(cue, kind)" />
              <NumberField :model-value="String(cue.action.channel)" :min="1" :max="16" :decimals="0" label="Ch" size="sm" @update:model-value="(value: string) => setCueField(cue, 'channel', Number(value))" />
            </div>
            <div v-if="cue.action.kind === 'midiProgram'" :class="editorRow">
              <NumberField
                :model-value="String(cue.action.program + 1)"
                :min="1"
                :max="128"
                :decimals="0"
                label="Patch"
                size="sm"
                @update:model-value="(value: string) => setCueField(cue, 'program', Number(value) - 1)"
              />
            </div>
            <div v-else-if="cue.action.kind === 'midiNote'" :class="editorRow">
              <NumberField :model-value="String(cue.action.note)" :min="0" :max="127" :decimals="0" label="Note" size="sm" @update:model-value="(value: string) => setCueField(cue, 'note', Number(value))" />
              <span :class="hint">{{ noteName(cue.action.note) }}</span>
              <NumberField :model-value="String(cue.action.velocity)" :min="1" :max="127" :decimals="0" label="Vel" size="sm" @update:model-value="(value: string) => setCueField(cue, 'velocity', Number(value))" />
            </div>
            <div v-else-if="cue.action.kind === 'midiCc'" :class="editorRow">
              <NumberField :model-value="String(cue.action.controller)" :min="0" :max="127" :decimals="0" label="CC" size="sm" @update:model-value="(value: string) => setCueField(cue, 'controller', Number(value))" />
              <NumberField :model-value="String(cue.action.value)" :min="0" :max="127" :decimals="0" label="Value" size="sm" @update:model-value="(value: string) => setCueField(cue, 'value', Number(value))" />
            </div>
          </div>
          <p :class="hint">Cues fire as the play head reaches them, on jumps and on every vamp pass. Save to hear changes.</p>
        </PanelSection>
      </Panel>
    </div>
    <div v-else-if="!loading" :class="center">
      <EmptyState icon="lucide:audio-waveform" title="Song not found" description="It may have been deleted. Pick another song." />
    </div>
  </div>
</template>
