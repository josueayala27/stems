<script setup lang="ts">
import type { Song } from '@stems/schema'
import { css } from 'styled-system/css'
import { computed, onMounted, ref } from 'vue'
import { Badge, Button, DataTable, EmptyState, type DataTableColumn } from '~/ui'
import { isTauri } from '~/data/db'
import { library } from '~/data/library'
import { getSong, listSongs, type SongSummary } from '~/data/songs'
import PageHeader from '~/shell/PageHeader.vue'
import LibraryLayout from './LibraryLayout.vue'
import ImportDialog from './songs/ImportDialog.vue'
import SongSheet from './songs/SongSheet.vue'
import { formatDuration } from './songs/format'

interface Row extends SongSummary {
  missing: number
}

const rows = ref<Row[]>([])
const loading = ref(true)
const importOpen = ref(false)
const sheetOpen = ref(false)
const current = ref<Song | null>(null)
const desktop = isTauri()

async function refresh() {
  const songs = await listSongs().catch(() => [])
  const files = songs.flatMap((song) => song.files)
  const exists = files.length ? await library.filesExist(files).catch(() => files.map(() => true)) : []
  let index = 0
  rows.value = songs.map((song) => {
    const missing = song.files.filter(() => !exists[index++]).length
    return { ...song, missing }
  })
  loading.value = false
}

onMounted(refresh)

async function openSong(row: Row) {
  current.value = await getSong(row.id)
  sheetOpen.value = current.value !== null
}

async function onImported(song: Song) {
  await refresh()
  current.value = song
  sheetOpen.value = true
}

async function onSaved(song: Song) {
  current.value = song
  await refresh()
}

const columns: DataTableColumn<Row>[] = [
  { key: 'title', header: 'Title', sortable: true },
  { key: 'artist', header: 'Artist', sortable: true, width: '20%' },
  { key: 'bpm', header: 'BPM', sortable: true, width: '80px', align: 'right' },
  { key: 'key', header: 'Key', width: '90px' },
  { key: 'durationSeconds', header: 'Length', sortable: true, width: '80px', align: 'right' },
  { key: 'trackCount', header: 'Tracks', sortable: true, width: '80px', align: 'right' },
  { key: 'status', header: 'Status', width: '110px', accessor: (row) => row.missing },
]

const sort = ref({ key: 'title', direction: 'asc' as const })
const hasSongs = computed(() => rows.value.length > 0)

const panel = css({ borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default', overflow: 'hidden' })
const numeric = css({ fontVariantNumeric: 'tabular-nums' })
</script>

<template>
  <LibraryLayout>
    <PageHeader eyebrow="Library" title="Songs" subtitle="Import stems, check analysis and edit song details.">
      <template #actions>
        <Button variant="primary" icon="lucide:import" :disabled="!desktop" @click="importOpen = true">Import stems</Button>
      </template>
    </PageHeader>

    <div v-if="loading || hasSongs" :class="panel">
      <DataTable
        v-model:sort="sort"
        :rows="rows"
        :columns="columns"
        row-key="id"
        sort-locally
        :loading="loading"
        :row-height="40"
        aria-label="Songs"
        :active-key="sheetOpen ? current?.id ?? null : null"
        :on-row-click="openSong"
      >
        <template #cell-bpm="{ value }"><span :class="numeric">{{ value ?? '—' }}</span></template>
        <template #cell-key="{ value }">{{ value || '—' }}</template>
        <template #cell-durationSeconds="{ value }"><span :class="numeric">{{ formatDuration(Number(value)) }}</span></template>
        <template #cell-status="{ row }">
          <Badge v-if="row.missing" size="sm" tone="danger" :label="`${row.missing} missing`" />
          <Badge v-else size="sm" tone="success" label="Ready" />
        </template>
      </DataTable>
    </div>
    <div v-else :class="panel">
      <EmptyState
        icon="lucide:music"
        title="No songs yet"
        description="Drop a folder of stems (WAV, AIFF, FLAC, MP3 or M4A) to create a song. Files stay where they are on disk unless you copy them into the library."
      />
    </div>

    <ImportDialog v-model:open="importOpen" @imported="onImported" />
    <SongSheet v-model:open="sheetOpen" :song="current" @saved="onSaved" />
  </LibraryLayout>
</template>
