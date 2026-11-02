<script setup lang="ts">
import { Icon } from '#components'
import { cva } from 'styled-system/css'
import type { Placement } from './composables/useFloatingSurface'
import Tooltip from './Tooltip.vue'

// Root is a Tooltip (fragment), so attrs and listeners are forwarded to the button explicitly.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** Lucide icon name. */
    icon: string
    /** Accessible name; also the tooltip text. */
    label: string
    shortcut?: string
    size?: 'sm' | 'md' | 'lg'
    variant?: 'ghost' | 'subtle'
    /** Pressed state for toggle buttons (sets `aria-pressed`). */
    active?: boolean
    disabled?: boolean
    tooltip?: boolean
    tooltipPlacement?: Placement
  }>(),
  { shortcut: undefined, size: 'md', variant: 'ghost', active: undefined, disabled: false, tooltip: true, tooltipPlacement: 'bottom' },
)

const button = cva({
  base: {
    display: 'inline-grid',
    placeItems: 'center',
    flexShrink: 0,
    borderRadius: 'sm',
    color: 'fg.muted',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: 'fast',
    transitionTimingFunction: 'standard',
    _hover: { bg: 'bg.hover', color: 'fg.default' },
    _active: { bg: 'bg.active' },
    _pressed: { bg: 'accent.muted', color: 'accent.hover', _hover: { bg: 'accent.muted', color: 'accent.hover' } },
    _disabled: { opacity: 0.4, pointerEvents: 'none' },
  },
  variants: {
    size: {
      sm: { w: 'control.sm', h: 'control.sm' },
      md: { w: 'control.md', h: 'control.md' },
      lg: { w: 'control.lg', h: 'control.lg' },
    },
    variant: {
      ghost: { bg: 'transparent' },
      subtle: { bg: 'bg.subtle' },
    },
  },
})

const iconSize = { sm: 14, md: 14, lg: 16 } as const
</script>

<template>
  <Tooltip :content="label" :shortcut="shortcut" :placement="tooltipPlacement" :disabled="!tooltip || disabled">
    <button
      v-bind="$attrs"
      type="button"
      :aria-label="label"
      :aria-pressed="props.active"
      :disabled="disabled"
      :class="button({ size, variant })"
    >
      <Icon :name="icon" :size="iconSize[size]" aria-hidden="true" />
    </button>
  </Tooltip>
</template>
