<script setup lang="ts">
import { css } from 'styled-system/css'
import { NuxtLink } from '#components'
import { computed } from 'vue'
import { Badge, Divider, IconButton } from '~/ui'
import { formatFrames } from '~/engine/engine'
import { usePlayer } from '~/engine/player'
import { useSidebar } from './sidebar'

// Readouts mirror the engine state; the engine is the clock.
const player = usePlayer()
const sidebar = useSidebar()
const readouts = computed(() => {
  const song = player.song.value
  return [
    { label: 'Setlist', value: 'None' },
    { label: 'Song', value: song?.title ?? 'None' },
    { label: 'Position', value: song ? formatFrames(player.position.value, player.sampleRate.value) : '—', mono: true },
    { label: 'BPM', value: song ? String(song.bpm) : '—', mono: true },
    { label: 'Key', value: song?.key || '—', mono: true },
  ]
})
const device = computed(() => player.output.value)

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
    <IconButton
      :icon="sidebar.collapsed.value ? 'lucide:panel-left-open' : 'lucide:panel-left-close'"
      :label="sidebar.collapsed.value ? 'Show the sidebar (⌘B)' : 'Collapse the sidebar (⌘B)'"
      variant="ghost"
      size="sm"
      @click="sidebar.toggle()"
    />
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
    <Badge
      v-if="device"
      tone="success"
      dot
      size="md"
      :label="device.name"
      :title="`${device.name}: ${device.sampleRate} Hz, ${device.bufferSize} frames, ${device.channels} outputs`"
    />
    <Badge v-else tone="warning" dot size="md" label="No device" title="The default output opens when you play a song." />
    <NuxtLink to="/settings" aria-label="Settings"><IconButton icon="lucide:settings" label="Settings" variant="ghost" size="md" tabindex="-1" /></NuxtLink>
  </header>
</template>
