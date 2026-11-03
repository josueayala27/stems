<script setup lang="ts">
import type { Setlist, SetlistItem } from '@stems/schema'
import { css } from 'styled-system/css'
import { useRouter } from 'vue-router'
import { computed, onMounted, ref } from 'vue'
import { applyMove, Button, EmptyState, IconButton, Input, NumberField, SegmentedControl, Select, SortableList, type SegmentOption, type SelectOption, type SortableMove } from '~/ui'
import { isTauri } from '~/data/db'
import { pickPaths } from '~/data/library'
import { deleteSetlist, getSetlist, listSetlists, newSetlist, saveSetlist, type SetlistSummary } from '~/data/setlists'
import { listSongs, type SongSummary } from '~/data/songs'
import PageHeader from '~/shell/PageHeader.vue'
import LibraryLayout from './LibraryLayout.vue'
import { fileName, formatDuration } from './songs/format'

const router = useRouter()
const desktop = isTauri()
const setlists = ref<SetlistSummary[]>([])
const songs = ref<SongSummary[]>([])
const current = ref<Setlist | null>(null)
const dirty = ref(false)
const saving = ref(false)
const message = ref<string | null>(null)
const adding = ref<string | undefined>(undefined)

const songById = computed(() => new Map(songs.value.map((song) => [song.id, song])))
const songOptions = computed<SelectOption[]>(() => songs.value.map((song) => ({ value: song.id, label: song.title })))
const transitions: SegmentOption<SetlistItem['transition']>[] = [
  { value: 'stop', label: 'Stop' },
  { value: 'auto', label: 'Auto' },
  { value: 'crossfade', label: 'Crossfade' },
]
const totalSeconds = computed(() => current.value?.items.reduce((sum, item) => sum + (songById.value.get(item.songId)?.durationSeconds ?? 0), 0) ?? 0)

async function refresh() {
  ;[setlists.value, songs.value] = await Promise.all([listSetlists().catch(() => []), listSongs().catch(() => [])])
}

onMounted(refresh)

async function open(id: string) {
  current.value = await getSetlist(id)
  dirty.value = false
  message.value = null
}

async function create() {
  const setlist = newSetlist(`Setlist ${setlists.value.length + 1}`)
  await saveSetlist(setlist)
  await refresh()
  await open(setlist.id)
}

function edit(change: (setlist: Setlist) => Setlist) {
  if (!current.value) return
  current.value = change(current.value)
  dirty.value = true
}

function updateItem(at: number, patch: Partial<SetlistItem>) {
  edit((setlist) => ({ ...setlist, items: setlist.items.map((item, i) => (i === at ? { ...item, ...patch } : item)) }))
}

function addSong(songId: string | undefined) {
  if (!songId) return
  edit((setlist) => ({ ...setlist, items: [...setlist.items, { songId, transition: 'stop', preWaitMs: 0, crossfadeMs: 4_000, pad: null }] }))
  adding.value = undefined
}

function removeItem(at: number) {
  edit((setlist) => ({ ...setlist, items: setlist.items.filter((_, i) => i !== at) }))
}

function onMove(move: SortableMove) {
  edit((setlist) => ({ ...setlist, items: applyMove({ items: setlist.items }, move).items ?? setlist.items }))
}

async function choosePad(at: number) {
  const [file] = await pickPaths('files')
  if (file) updateItem(at, { pad: { file, name: fileName(file).replace(/\.[^.]+$/, '') } })
}

async function save() {
  if (!current.value) return
  saving.value = true
  try {
    await saveSetlist(current.value)
    dirty.value = false
    message.value = 'Saved.'
    await refresh()
  } catch (cause) {
    message.value = String(cause)
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!current.value) return
  await deleteSetlist(current.value.id)
  current.value = null
  await refresh()
}

async function perform() {
  if (!current.value) return
  if (dirty.value) await save()
  await router.push({ path: '/', query: { setlist: current.value.id } })
}

const layout = css({ display: 'grid', gridTemplateColumns: '[260px 1fr]', gap: '4', minH: '0' })
const panel = css({ borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default', p: '3', minW: '0' })
const listButton = css({
  display: 'flex',
  justifyContent: 'space-between',
  w: 'full',
  px: '3',
  h: '[40px]',
  alignItems: 'center',
  borderRadius: 'md',
  textStyle: 'ui.sm',
  color: 'fg.default',
  _hover: { bg: 'bg.hover' },
  '&[aria-current=true]': { bg: 'bg.hover', color: 'accent.default' },
})
const muted = css({ color: 'fg.muted', textStyle: 'ui.sm', fontVariantNumeric: 'tabular-nums' })
const toolbar = css({ display: 'flex', alignItems: 'center', gap: '2', mb: '4' })
const spacer = css({ flex: '1' })
const item = css({
  display: 'grid',
  gridTemplateColumns: '[28px minmax(140px, 1fr) auto 110px 110px minmax(120px, 160px) auto]',
  alignItems: 'center',
  gap: '3',
  py: '2',
  textStyle: 'ui.sm',
})
const number = css({ color: 'fg.subtle', fontVariantNumeric: 'tabular-nums', textAlign: 'right' })
const title = css({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const add = css({ display: 'flex', gap: '2', mt: '4', maxW: '[420px]' })
</script>

<template>
  <LibraryLayout>
    <PageHeader eyebrow="Library" title="Setlists" subtitle="Order songs, set transitions and pads between them.">
      <template #actions>
        <Button variant="primary" icon="lucide:plus" :disabled="!desktop" @click="create">New setlist</Button>
      </template>
    </PageHeader>
    <div :class="layout">
      <div :class="panel">
        <EmptyState v-if="!setlists.length" icon="lucide:list-music" title="No setlists" description="Your setlists appear here." size="sm" />
        <button
          v-for="entry in setlists"
          :key="entry.id"
          type="button"
          :class="listButton"
          :aria-current="current?.id === entry.id"
          @click="open(entry.id)"
        >
          <span>{{ entry.name }}</span>
          <span :class="muted">{{ entry.songCount }}</span>
        </button>
      </div>

      <div :class="panel">
        <EmptyState
          v-if="!current"
          icon="lucide:arrow-down-up"
          title="Nothing selected"
          description="Pick a setlist to order its songs, choose stop, auto or crossfade transitions, and add pads."
        />
        <template v-else>
          <div :class="toolbar">
            <Input :model-value="current.name" aria-label="Setlist name" @update:model-value="(name: string) => edit((s) => ({ ...s, name }))" />
            <span :class="muted">{{ current.items.length }} songs · {{ formatDuration(totalSeconds) }}</span>
            <span :class="spacer" />
            <span :class="muted" role="status">{{ message }}</span>
            <IconButton icon="lucide:trash-2" label="Delete setlist" @click="remove" />
            <Button :loading="saving" :disabled="!dirty" @click="save">Save</Button>
            <Button variant="primary" icon="lucide:play" :disabled="!current.items.length" @click="perform">Perform</Button>
          </div>

          <SortableList
            :items="current.items"
            list-id="items"
            :item-key="(entry: SetlistItem) => `${entry.songId}:${current!.items.indexOf(entry)}`"
            :item-label="(entry: SetlistItem) => songById.get(entry.songId)?.title ?? 'Missing song'"
            aria-label="Songs in this setlist"
            empty-text="Add songs below"
            @move="onMove"
          >
            <template #default="{ item: entry, index }">
              <div :class="item">
                <span :class="number">{{ index + 1 }}</span>
                <span :class="title">{{ songById.get(entry.songId)?.title ?? 'Missing song' }}</span>
                <SegmentedControl
                  :model-value="entry.transition"
                  :options="transitions"
                  size="sm"
                  :disabled="index === 0"
                  :aria-label="`Transition into song ${index + 1}`"
                  @update:model-value="(transition?: SetlistItem['transition']) => transition && updateItem(index, { transition })"
                />
                <NumberField
                  :model-value="String(entry.preWaitMs / 1000)"
                  :min="0"
                  :max="60"
                  :decimals="1"
                  size="sm"
                  label="Wait"
                  :disabled="index === 0 || entry.transition !== 'auto'"
                  @update:model-value="(value: string) => updateItem(index, { preWaitMs: Math.round(Number(value) * 1000) || 0 })"
                />
                <NumberField
                  :model-value="String(entry.crossfadeMs / 1000)"
                  :min="0"
                  :max="30"
                  :decimals="1"
                  size="sm"
                  label="Fade"
                  :disabled="index === 0 || entry.transition !== 'crossfade'"
                  @update:model-value="(value: string) => updateItem(index, { crossfadeMs: Math.round(Number(value) * 1000) || 0 })"
                />
                <Button size="sm" variant="ghost" icon="lucide:waves" :title="entry.pad?.file" @click="choosePad(index)">
                  {{ entry.pad?.name ?? 'Pad…' }}
                </Button>
                <span>
                  <IconButton v-if="entry.pad" icon="lucide:x" label="Remove pad" size="sm" @click="updateItem(index, { pad: null })" />
                  <IconButton icon="lucide:minus-circle" label="Remove from setlist" size="sm" @click="removeItem(index)" />
                </span>
              </div>
            </template>
          </SortableList>

          <div :class="add">
            <Select v-model="adding" :options="songOptions" placeholder="Add a song…" aria-label="Add a song" @update:model-value="addSong" />
          </div>
        </template>
      </div>
    </div>
  </LibraryLayout>
</template>
