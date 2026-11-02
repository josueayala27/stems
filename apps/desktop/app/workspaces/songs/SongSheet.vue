<script setup lang="ts">
import type { Song } from '@stems/schema'
import { css } from 'styled-system/css'
import { computed, ref, shallowRef, watch } from 'vue'
import { Badge, Button, Input, NumberField, SegmentedControl, Sheet, type SegmentOption } from '~/ui'
import type { Peaks } from '~/audio/peaks'
import Waveform from '~/audio/Waveform.vue'
import { library, pickPaths } from '~/data/library'
import { saveSong } from '~/data/songs'
import { usePlayer } from '~/engine/player'
import { fileName, formatDuration } from './format'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ song: Song | null }>()
const emit = defineEmits<{ saved: [song: Song] }>()

const title = ref('')
const artist = ref('')
const bpm = ref('')
const key = ref('')
const zoom = ref(1)
const peaks = shallowRef<Record<string, Peaks | null>>({})
const missing = ref<Set<string>>(new Set())
const saving = ref(false)
const relinking = ref(false)
const message = ref<string | null>(null)

const player = usePlayer()

const zooms: SegmentOption<number>[] = [1, 4, 16, 64].map((value) => ({ value, label: `${value}×` }))

async function load(song: Song) {
  title.value = song.title
  artist.value = song.artist
  bpm.value = String(song.bpm)
  key.value = song.key
  zoom.value = 1
  message.value = null
  const exists = await library.filesExist(song.tracks.map((track) => track.file)).catch(() => song.tracks.map(() => true))
  missing.value = new Set(song.tracks.filter((_, index) => !exists[index]).map((track) => track.id))
  const loaded: Record<string, Peaks | null> = {}
  await Promise.all(
    song.tracks.map(async (track) => {
      loaded[track.id] = await library.peaks(track.hash).catch(() => null)
    }),
  )
  peaks.value = loaded
}

watch(
  () => [props.song, open.value] as const,
  ([song, isOpen]) => {
    if (song && isOpen) void load(song)
  },
  { immediate: true },
)

/** Frames at the song rate shown at the current zoom, from the start. */
const visibleEnd = computed(() => (props.song ? Math.max(1, Math.round(props.song.durationSamples / zoom.value)) : 1))

/** The track's range at its own rate: peak files are stored at the file rate. */
function trackEnd(trackPeaks: Peaks | null): number | undefined {
  if (!trackPeaks || !props.song) return undefined
  return (visibleEnd.value * trackPeaks.sampleRate) / props.song.sampleRate
}

function edited(song: Song): Song {
  const tempo = Number(bpm.value)
  const valid = Number.isFinite(tempo) && tempo > 0 && tempo <= 999
  return {
    ...song,
    title: title.value.trim() || song.title,
    artist: artist.value.trim(),
    key: key.value.trim(),
    bpm: valid ? tempo : song.bpm,
    tempoMap: valid && song.tempoMap.length <= 1 ? song.tempoMap.map((point) => ({ ...point, bpm: tempo })) : song.tempoMap,
  }
}

async function save() {
  if (!props.song) return
  saving.value = true
  try {
    const song = edited(props.song)
    await saveSong(song)
    emit('saved', song)
    message.value = 'Saved.'
  } catch (cause) {
    message.value = String(cause)
  } finally {
    saving.value = false
  }
}

async function relink() {
  const song = props.song
  if (!song) return
  const [folder] = await pickPaths('folder')
  if (!folder) return
  relinking.value = true
  try {
    const lost = song.tracks.filter((track) => missing.value.has(track.id))
    const found = await library.relink(lost.map(({ hash, file }) => ({ hash, file })), folder)
    const byHash = new Map(found.map((item) => [item.hash, item.file]))
    const updated = { ...edited(song), tracks: song.tracks.map((track) => ({ ...track, file: byHash.get(track.hash) ?? track.file })) }
    await saveSong(updated)
    emit('saved', updated)
    message.value = `Found ${found.length} of ${lost.length} missing ${lost.length === 1 ? 'file' : 'files'}.`
  } catch (cause) {
    message.value = String(cause)
  } finally {
    relinking.value = false
  }
}

const fields = css({ display: 'grid', gridTemplateColumns: '[1fr 1fr]', gap: '3', mb: '5' })
const label = css({ textStyle: 'ui.label', color: 'fg.muted', mb: '1.5' })
const toolbar = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2', mb: '3' })
const meta = css({ textStyle: 'ui.sm', color: 'fg.muted', fontVariantNumeric: 'tabular-nums' })
const tracks = css({ display: 'flex', flexDirection: 'column', gap: '3' })
const trackHead = css({ display: 'flex', alignItems: 'center', gap: '2', textStyle: 'ui.sm', mb: '1' })
const trackFile = css({ color: 'fg.muted', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minW: '0' })
const lane = css({ borderRadius: 'sm', bg: 'bg.input', overflow: 'hidden' })
const footer = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2', w: 'full' })
</script>

<template>
  <Sheet v-model:open="open" :title="song?.title ?? 'Song'" description="Song details, tracks and waveforms." size="lg">
    <template v-if="song">
      <div :class="fields">
        <div><div :class="label">Title</div><Input v-model="title" aria-label="Title" /></div>
        <div><div :class="label">Artist</div><Input v-model="artist" aria-label="Artist" /></div>
        <div><div :class="label">BPM</div><NumberField v-model="bpm" :min="1" :max="999" :decimals="2" aria-label="BPM" /></div>
        <div><div :class="label">Key</div><Input v-model="key" placeholder="e.g. A minor" aria-label="Key" /></div>
      </div>

      <div :class="toolbar">
        <span :class="meta">{{ song.tracks.length }} tracks · {{ formatDuration(song.durationSamples / song.sampleRate) }}</span>
        <SegmentedControl v-model="zoom" :options="zooms" size="sm" aria-label="Zoom" />
      </div>

      <div :class="tracks">
        <div v-for="track in song.tracks" :key="track.id">
          <div :class="trackHead">
            <span>{{ track.name }}</span>
            <Badge v-if="track.kind !== 'stem'" size="sm" tone="info" :label="track.kind" />
            <Badge v-if="missing.has(track.id)" size="sm" tone="danger" label="missing" />
            <span :class="trackFile" :title="track.file">{{ fileName(track.file) }}</span>
          </div>
          <div :class="lane">
            <Waveform
              :peaks="peaks[track.id] ?? null"
              :color="track.color"
              :end="trackEnd(peaks[track.id] ?? null)"
              :height="40"
              :aria-label="`${track.name} waveform`"
            />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div :class="footer">
        <span :class="meta" role="status">{{ message }}</span>
        <div :class="toolbar">
          <Button
            icon="lucide:play"
            :loading="player.loading.value"
            :disabled="!song || missing.size > 0"
            :title="missing.size ? 'Find the missing files first.' : undefined"
            @click="song && player.play(edited(song))"
          >
            Play
          </Button>
          <Button v-if="missing.size" icon="lucide:search" :loading="relinking" @click="relink">Find missing files…</Button>
          <Button variant="primary" :loading="saving" @click="save">Save</Button>
        </div>
      </div>
    </template>
  </Sheet>
</template>
