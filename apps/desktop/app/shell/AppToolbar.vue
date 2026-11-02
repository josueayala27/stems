<script setup lang="ts">
import { css } from 'styled-system/css'
import { NuxtLink } from '#components'
import { Badge, Divider, IconButton } from '~/ui'

// Readouts mirror the engine state. Until the engine lands they show the stopped, empty state.
const readouts = [
  { label: 'Setlist', value: 'None' },
  { label: 'Song', value: 'None' },
  { label: 'Position', value: '1.1', mono: true },
  { label: 'BPM', value: '—', mono: true },
  { label: 'Key', value: '—', mono: true },
]

const root = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  h: 'toolbar',
  px: '3',
  flexShrink: '0',
  bg: 'bg.panel',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
})
const brand = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  borderRadius: 'sm',
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[2px]' },
})
const mark = css({
  display: 'grid',
  placeItems: 'center',
  w: '6',
  h: '6',
  borderRadius: 'sm',
  background: '[token(gradients.sheen), token(colors.accent.default)]',
  color: 'accent.fg',
  textStyle: 'ui.xs',
  fontWeight: 'bold',
  letterSpacing: 'tight',
})
const wordmark = css({ textStyle: 'ui.title', color: 'fg.default' })
const readoutList = css({ display: 'flex', alignItems: 'center', gap: '5', minW: '0', overflow: 'hidden' })
const readout = css({ display: 'flex', flexDirection: 'column', minW: '0' })
const readoutLabel = css({ textStyle: 'ui.label', color: 'fg.subtle', textTransform: 'uppercase' })
const readoutValue = css({ textStyle: 'ui.sm', color: 'fg.default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
const mono = css({ fontFamily: 'mono' })
const spacer = css({ flex: '1' })
</script>

<template>
  <header :class="root">
    <NuxtLink to="/" :class="brand" aria-label="Stems, Play workspace">
      <span :class="mark" aria-hidden="true">S</span>
      <span :class="wordmark">Stems</span>
    </NuxtLink>
    <Divider orientation="vertical" />
    <dl :class="readoutList" aria-label="Transport status">
      <div v-for="item in readouts" :key="item.label" :class="readout">
        <dt :class="readoutLabel">{{ item.label }}</dt>
        <dd :class="[readoutValue, item.mono ? mono : '']">{{ item.value }}</dd>
      </div>
    </dl>
    <span :class="spacer" />
    <Badge tone="neutral" icon="lucide:link" size="md" label="Link off" title="Ableton Link is not connected." />
    <Badge tone="warning" dot size="md" label="No device" title="Choose an audio output in Settings." />
    <NuxtLink to="/settings" aria-label="Settings"><IconButton icon="lucide:settings" label="Settings" variant="ghost" size="md" tabindex="-1" /></NuxtLink>
  </header>
</template>
