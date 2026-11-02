<script setup lang="ts">
import { Icon } from '#components'
import { cva } from 'styled-system/css'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

withDefaults(
  defineProps<{
    tone?: BadgeTone
    size?: 'sm' | 'md'
    /** Leading status dot in the tone colour. */
    dot?: boolean
    /** Lucide icon name, shown instead of the dot. */
    icon?: string
    label?: string
  }>(),
  { tone: 'neutral', size: 'sm', dot: false, icon: undefined, label: undefined },
)

// Text stays `fg.default` for contrast in both themes; the tone shows in the tint and the dot.
const badge = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1',
    flexShrink: 0,
    maxW: 'full',
    borderRadius: 'full',
    color: 'fg.default',
    whiteSpace: 'nowrap',
    '& [data-part=dot]': { w: '1.5', h: '1.5', borderRadius: 'full', flexShrink: 0, bg: 'currentColor' },
    '& [data-part=mark]': { display: 'inline-flex', flexShrink: 0 },
    '& [data-part=label]': { overflow: 'hidden', textOverflow: 'ellipsis' },
  },
  variants: {
    tone: {
      neutral: { bg: 'bg.subtle', '& [data-part=mark]': { color: 'fg.subtle' } },
      success: { bg: 'success.muted', '& [data-part=mark]': { color: 'success.default' } },
      warning: { bg: 'warning.muted', '& [data-part=mark]': { color: 'warning.default' } },
      danger: { bg: 'danger.muted', '& [data-part=mark]': { color: 'danger.default' } },
      info: { bg: 'info.muted', '& [data-part=mark]': { color: 'info.default' } },
    },
    size: {
      sm: { h: '[18px]', px: '1.5', textStyle: 'ui.xs' },
      md: { h: 'control.sm', px: '2', textStyle: 'ui.sm' },
    },
  },
})
</script>

<template>
  <span :class="badge({ tone, size })" :data-tone="tone">
    <span v-if="icon" data-part="mark"><Icon :name="icon" :size="size === 'sm' ? 10 : 12" aria-hidden="true" /></span>
    <span v-else-if="dot" data-part="mark"><span data-part="dot" aria-hidden="true" /></span>
    <span data-part="label"><slot>{{ label }}</slot></span>
  </span>
</template>
