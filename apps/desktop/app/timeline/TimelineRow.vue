<script setup lang="ts">
// One row of a Timeline: a header cell and a lane that spans the visible view.
import { css } from 'styled-system/css'

withDefaults(defineProps<{ height?: number; headerWidth?: number; label?: string }>(), { height: 56, headerWidth: 200, label: undefined })
defineSlots<{ header?: () => unknown; default?: () => unknown }>()

const row = css({ display: 'grid', borderBottomWidth: '1px', borderColor: 'border.default' })
const header = css({ display: 'flex', alignItems: 'center', gap: '2', px: '3', minW: '0', borderRightWidth: '1px', borderColor: 'border.default', bg: 'bg.panel' })
const lane = css({ position: 'relative', overflow: 'hidden', minW: '0' })
</script>

<template>
  <div :class="row" :style="{ gridTemplateColumns: `${headerWidth}px 1fr`, height: `${height}px` }">
    <div :class="header"><slot name="header" /></div>
    <div :class="lane" :aria-label="label"><slot /></div>
  </div>
</template>
