<script setup lang="ts">
import { cva } from 'styled-system/css'

withDefaults(defineProps<{ direction?: 'vertical' | 'horizontal' | 'both' }>(), { direction: 'vertical' })

// Native scrolling with a thin thumb that only shows while the area is hovered or focused.
const area = cva({
  base: {
    minH: '0',
    minW: '0',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'thin',
    scrollbarColor: 'transparent transparent',
    transitionProperty: 'scrollbar-color',
    transitionDuration: 'normal',
    _hover: { scrollbarColor: 'token(colors.border.strong) transparent' },
    _focusWithin: { scrollbarColor: 'token(colors.border.strong) transparent' },
    '&::-webkit-scrollbar': { w: '2', h: '2' },
    '&::-webkit-scrollbar-track': { bg: 'transparent' },
    '&::-webkit-scrollbar-thumb': {
      bg: 'transparent',
      borderRadius: 'full',
      borderWidth: '2px',
      borderStyle: 'solid',
      borderColor: 'transparent',
      backgroundClip: 'padding-box',
    },
    '&:hover::-webkit-scrollbar-thumb': { bg: 'border.strong' },
  },
  variants: {
    direction: {
      vertical: { overflowY: 'auto', overflowX: 'hidden' },
      horizontal: { overflowX: 'auto', overflowY: 'hidden' },
      both: { overflow: 'auto' },
    },
  },
})
</script>

<template>
  <div :class="area({ direction })">
    <slot />
  </div>
</template>
