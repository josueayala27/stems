<script setup lang="ts">
import { css } from 'styled-system/css'

defineProps<{ eyebrow: string; title: string; subtitle?: string; compact?: boolean }>()
defineSlots<{ badges?: () => unknown; actions?: () => unknown }>()

const header = css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4', mb: '5' })
const text = css({ minW: '0' })
const eyebrowClass = css({ textStyle: 'ui.label', color: 'accent.default', textTransform: 'uppercase', mb: '1' })
const titleRow = css({ display: 'flex', alignItems: 'center', gap: '2' })
const titleClass = css({ textStyle: 'display.md', color: 'fg.default' })
const subtitleClass = css({ mt: '1', textStyle: 'ui.sm', color: 'fg.muted', maxW: '[640px]' })
const actionsClass = css({ display: 'flex', alignItems: 'center', gap: '2', flexShrink: '0' })
</script>

<template>
  <header :class="header">
    <div :class="text">
      <p :class="eyebrowClass">{{ eyebrow }}</p>
      <div :class="titleRow">
        <h1 :class="titleClass">{{ title }}</h1>
        <slot name="badges" />
      </div>
      <p v-if="subtitle" :class="subtitleClass">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" :class="actionsClass"><slot name="actions" /></div>
  </header>
</template>
