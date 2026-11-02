<script setup lang="ts">
import { cva } from 'styled-system/css'

withDefaults(defineProps<{ color: string; size?: 'sm' | 'md' | 'lg'; shape?: 'square' | 'round' }>(), {
  size: 'md',
  shape: 'square',
})

// The checkerboard shows through translucent colours.
const swatch = cva({
  base: {
    position: 'relative',
    display: 'inline-block',
    flexShrink: 0,
    overflow: 'hidden',
    backgroundImage:
      'conic-gradient(token(colors.fg.subtle) 25%, token(colors.bg.active) 0 50%, token(colors.fg.subtle) 0 75%, token(colors.bg.active) 0)',
    backgroundSize: '[8px 8px]',
    _after: {
      content: '""',
      position: 'absolute',
      inset: '0',
      bg: 'var(--swatch-color)',
      borderRadius: 'inherit',
      borderWidth: '1px',
      borderColor: 'border.strong',
    },
  },
  variants: {
    size: {
      sm: { w: '3', h: '3' },
      md: { w: '4', h: '4' },
      lg: { w: '5', h: '5' },
    },
    shape: { square: { borderRadius: 'xs' }, round: { borderRadius: 'full' } },
  },
})
</script>

<template>
  <span :class="swatch({ size, shape })" :style="{ '--swatch-color': color }" aria-hidden="true" />
</template>
