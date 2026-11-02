<script setup lang="ts">
import { css, cva } from 'styled-system/css'

withDefaults(defineProps<{ disabled?: boolean; ariaLabel?: string; size?: 'sm' | 'md' }>(), {
  disabled: false,
  ariaLabel: undefined,
  size: 'md',
})

const model = defineModel<boolean>({ default: false })

const track = cva({
  base: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    p: '0.5',
    borderRadius: 'full',
    bg: 'bg.active',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: 'fast',
    transitionTimingFunction: 'standard',
    _hover: { bg: 'border.strong' },
    _checked: { bg: 'accent.default', _hover: { bg: 'accent.hover' } },
    _disabled: { opacity: 0.4, pointerEvents: 'none' },
    '&[aria-checked=true] [data-part=thumb]': { transform: 'translateX(100%)' },
  },
  variants: {
    size: {
      sm: { w: '6', h: '3.5', '& [data-part=thumb]': { w: '2.5', h: '2.5' } },
      md: { w: '7', h: '4', '& [data-part=thumb]': { w: '3', h: '3' } },
    },
  },
})

const thumb = css({
  display: 'block',
  borderRadius: 'full',
  bg: 'fg.onAccent',
  boxShadow: 'xs',
  transitionProperty: 'transform',
  transitionDuration: 'normal',
  transitionTimingFunction: 'emphasized',
})
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="ariaLabel"
    :disabled="disabled"
    :class="track({ size })"
    @click="model = !model"
  >
    <span data-part="thumb" :class="thumb" />
  </button>
</template>
