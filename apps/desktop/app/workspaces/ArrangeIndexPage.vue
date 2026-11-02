<script setup lang="ts">
import { css } from 'styled-system/css'
import { NuxtLink } from '#components'
import { onMounted, ref } from 'vue'
import { Button, EmptyState } from '~/ui'
import { listSongs, type SongSummary } from '~/data/songs'
import PageHeader from '~/shell/PageHeader.vue'
import SkeletonBlock from '~/shell/SkeletonBlock.vue'
import LibraryLayout from './LibraryLayout.vue'

const songs = ref<SongSummary[]>([])
const loading = ref(true)

onMounted(async () => {
  songs.value = await listSongs().catch(() => [])
  loading.value = false
})

const grid = css({ display: 'grid', gridTemplateColumns: '[repeat(auto-fill, minmax(220px, 1fr))]', gap: '3' })
const card = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  p: '4',
  borderRadius: 'lg',
  bg: 'bg.panel',
  borderWidth: '1px',
  borderColor: 'border.default',
  _hover: { bg: 'bg.hover' },
})
const titleClass = css({ textStyle: 'ui.title', color: 'fg.default' })
const artistClass = css({ textStyle: 'ui.sm', color: 'fg.muted' })
const panel = css({ borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default' })
</script>

<template>
  <LibraryLayout>
    <PageHeader eyebrow="Build" title="Arrange" subtitle="Pick a song to edit its sections, markers, cue events and tempo map." />
    <div v-if="loading" :class="grid" aria-busy="true">
      <SkeletonBlock v-for="index in 3" :key="index" height="88px" />
    </div>
    <div v-else-if="songs.length" :class="grid">
      <NuxtLink v-for="song in songs" :key="song.id" :to="`/arrange/${song.id}`" :class="card">
        <span :class="titleClass">{{ song.title }}</span>
        <span :class="artistClass">{{ song.artist || 'Unknown artist' }}</span>
      </NuxtLink>
    </div>
    <div v-else :class="panel">
      <EmptyState icon="lucide:audio-waveform" title="No songs to arrange" description="Import stems in Songs first, then come back to lay out sections and cues.">
        <template #actions>
          <NuxtLink to="/songs"><Button tabindex="-1">Go to Songs</Button></NuxtLink>
        </template>
      </EmptyState>
    </div>
  </LibraryLayout>
</template>
