<script setup lang="ts">
import { cva } from 'styled-system/css'

withDefaults(defineProps<{ orientation?: 'horizontal' | 'vertical'; inset?: boolean }>(), {
  orientation: 'horizontal',
  inset: false,
})

const divider = cva({
  base: { flexShrink: 0, bg: 'border.default', border: 'none' },
  variants: {
    orientation: {
      horizontal: { h: '[1px]', w: 'full' },
      vertical: { w: '[1px]', h: '4', alignSelf: 'center' },
    },
    inset: { true: {} },
  },
  compoundVariants: [{ orientation: 'horizontal', inset: true, css: { w: 'auto', mx: '3' } }],
})
</script>

<template>
  <div role="separator" :aria-orientation="orientation" :class="divider({ orientation, inset })" />
</template>
