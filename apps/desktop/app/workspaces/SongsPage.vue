<script setup lang="ts">
import { css } from 'styled-system/css'
import { NuxtLink } from '#components'
import { onMounted, ref } from 'vue'
import { Button, EmptyState, Tooltip } from '~/ui'
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

const list = css({ display: 'flex', flexDirection: 'column', gap: '2' })
const row = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  h: '[48px]',
  px: '3',
  borderRadius: 'md',
  bg: 'bg.panel',
  borderWidth: '1px',
  borderColor: 'border.default',
  _hover: { bg: 'bg.hover' },
})
const titleClass = css({ textStyle: 'ui.md', color: 'fg.default' })
const artistClass = css({ textStyle: 'ui.sm', color: 'fg.muted' })
const panel = css({ borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default' })
</script>

<template>
  <LibraryLayout>
    <PageHeader eyebrow="Library" title="Songs" subtitle="Import stems, check analysis and edit song details.">
      <template #actions>
        <Tooltip content="Stem import arrives with the library engine.">
          <span><Button variant="primary" icon="lucide:import" disabled>Import stems</Button></span>
        </Tooltip>
      </template>
    </PageHeader>
    <div v-if="loading" :class="list" aria-busy="true">
      <SkeletonBlock v-for="index in 4" :key="index" />
    </div>
    <div v-else-if="songs.length" :class="list">
      <NuxtLink v-for="song in songs" :key="song.id" :to="`/arrange/${song.id}`" :class="row">
        <span :class="titleClass">{{ song.title }}</span>
        <span :class="artistClass">{{ song.artist }}</span>
      </NuxtLink>
    </div>
    <div v-else :class="panel">
      <EmptyState icon="lucide:music" title="No songs yet" description="Drop a folder of stems (WAV, AIFF, FLAC, MP3 or M4A) to create a song. Files stay where they are on disk." />
    </div>
  </LibraryLayout>
</template>
