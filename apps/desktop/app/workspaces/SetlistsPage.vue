<script setup lang="ts">
import { css } from 'styled-system/css'
import { Button, EmptyState, Tooltip } from '~/ui'
import PageHeader from '~/shell/PageHeader.vue'
import LibraryLayout from './LibraryLayout.vue'

const layout = css({ display: 'grid', gridTemplateColumns: '[280px 1fr]', gap: '4' })
const panel = css({ borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default' })
</script>

<template>
  <LibraryLayout>
    <PageHeader eyebrow="Library" title="Setlists" subtitle="Order songs, set transitions and pads between them.">
      <template #actions>
        <Tooltip content="Setlists arrive with the Perform milestone.">
          <span><Button variant="primary" icon="lucide:plus" disabled>New setlist</Button></span>
        </Tooltip>
      </template>
    </PageHeader>
    <div :class="layout">
      <div :class="panel">
        <EmptyState icon="lucide:list-music" title="No setlists" description="Your setlists appear here." size="sm" />
      </div>
      <div :class="panel">
        <EmptyState icon="lucide:arrow-down-up" title="Nothing selected" description="Pick a setlist to order its songs, choose stop, auto or crossfade transitions, and add pads." />
      </div>
    </div>
  </LibraryLayout>
</template>
