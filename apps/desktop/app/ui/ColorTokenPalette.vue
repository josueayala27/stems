<script setup lang="ts">
import { css, cva } from 'styled-system/css'
import Swatch from './Swatch.vue'
import type { ColorToken } from './types'

// Swatch grid of design tokens shown under the colour picker.
defineProps<{ tokens: ColorToken[]; selected?: string | null }>()
const emit = defineEmits<{ pick: [token: ColorToken] }>()

const root = css({ display: 'flex', flexDirection: 'column', gap: '1.5', px: '1', pb: '1' })
const heading = css({ textStyle: 'ui.label', color: 'fg.subtle' })
const grid = css({ display: 'flex', flexWrap: 'wrap', gap: '1' })
const item = cva({
  base: {
    display: 'inline-grid',
    placeItems: 'center',
    p: '0.5',
    borderRadius: 'sm',
    borderWidth: '1px',
    borderColor: 'transparent',
    cursor: 'pointer',
    _hover: { borderColor: 'border.strong' },
  },
  variants: { selected: { true: { borderColor: 'accent.default', _hover: { borderColor: 'accent.default' } } } },
})
</script>

<template>
  <div v-if="tokens.length" :class="root">
    <span :class="heading">Tokens</span>
    <div :class="grid" role="listbox" aria-label="Colour tokens">
      <button
        v-for="token in tokens"
        :key="token.key"
        type="button"
        role="option"
        :aria-selected="selected === token.key"
        :title="token.name ?? token.key"
        :aria-label="token.name ?? token.key"
        :class="item({ selected: selected === token.key })"
        @click="emit('pick', token)"
      >
        <Swatch :color="token.value" size="lg" />
      </button>
    </div>
  </div>
</template>
