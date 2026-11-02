<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed } from 'vue'
import { formatShortcut } from './lib/shortcut'

const props = withDefaults(
  defineProps<{
    /** Shortcut like `'Mod+Shift+K'`; modifiers render as platform symbols. */
    shortcut: string
    tone?: 'default' | 'subtle'
  }>(),
  { tone: 'default' },
)

const keys = computed(() => formatShortcut(props.shortcut))

const root = css({ display: 'inline-flex', alignItems: 'center', gap: '0.5' })
const key = css({
  display: 'inline-grid',
  placeItems: 'center',
  minW: '4',
  h: '4',
  px: '1',
  borderRadius: 'xs',
  textStyle: 'ui.xs',
  fontFamily: 'ui',
  color: 'fg.muted',
  bg: 'bg.subtle',
  borderBottomWidth: '1px',
  borderColor: 'border.strong',
})
const subtle = css({ bg: 'transparent', borderBottomWidth: '0', px: '0', minW: '0', color: 'fg.subtle' })
</script>

<template>
  <kbd :class="root" :aria-label="shortcut">
    <span v-for="(k, i) in keys" :key="i" :class="[key, tone === 'subtle' && subtle]">{{ k }}</span>
  </kbd>
</template>
