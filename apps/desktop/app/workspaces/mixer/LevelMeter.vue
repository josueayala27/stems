<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed } from 'vue'
import { clips, meterFraction } from './levels'

// A horizontal meter: the bar is the RMS, the tick is the peak. Both are linear levels from the engine.
const props = withDefaults(defineProps<{ peak: number; rms: number; label?: string }>(), { label: undefined })

const rmsWidth = computed(() => `${(meterFraction(props.rms) * 100).toFixed(1)}%`)
const peakLeft = computed(() => `${(meterFraction(props.peak) * 100).toFixed(1)}%`)
const clipping = computed(() => clips(props.peak))

const track = css({ position: 'relative', h: '[6px]', w: 'full', minW: '[60px]', borderRadius: 'full', bg: 'bg.subtle', overflow: 'hidden' })
const fill = css({ position: 'absolute', insetY: '0', left: '0', bg: 'accent.default', borderRadius: 'full' })
const fillClip = css({ bg: 'danger.default' })
const tick = css({ position: 'absolute', insetY: '0', w: '[2px]', ml: '[-1px]', bg: 'fg.default' })
const tickClip = css({ bg: 'danger.default' })
</script>

<template>
  <div :class="track" role="meter" :aria-label="label" aria-valuemin="0" aria-valuemax="1" :aria-valuenow="Number(peak.toFixed(3))">
    <span :class="[fill, clipping && fillClip]" :style="{ width: rmsWidth }" />
    <span v-if="peak > 0" :class="[tick, clipping && tickClip]" :style="{ left: peakLeft }" />
  </div>
</template>
