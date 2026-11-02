<script setup lang="ts">
import { Icon } from '#components'
import { cva, type RecipeVariantProps } from 'styled-system/css'
import { computed } from 'vue'
import Spinner from './Spinner.vue'

const button = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.5',
    flexShrink: 0,
    borderRadius: 'sm',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    transitionProperty: 'background, color, box-shadow, opacity',
    transitionDuration: 'fast',
    transitionTimingFunction: 'standard',
    _disabled: { opacity: 0.4, cursor: 'default', pointerEvents: 'none' },
  },
  variants: {
    variant: {
      // Filled buttons carry the brand `sheen` highlight over their colour.
      primary: {
        background: '[token(gradients.sheen), token(colors.accent.default)]',
        color: 'fg.onAccent',
        _hover: { background: '[token(gradients.sheen), token(colors.accent.hover)]' },
        _active: { background: 'accent.pressed' },
      },
      secondary: {
        bg: 'bg.subtle',
        color: 'fg.default',
        borderWidth: '1px',
        borderColor: 'border.default',
        _hover: { bg: 'bg.active' },
        _active: { bg: 'bg.hover' },
      },
      ghost: {
        bg: 'transparent',
        color: 'fg.muted',
        _hover: { bg: 'bg.hover', color: 'fg.default' },
        _active: { bg: 'bg.active' },
      },
      danger: {
        background: '[token(gradients.sheen), token(colors.danger.default)]',
        color: 'fg.onAccent',
        _hover: { opacity: 0.88 },
        _active: { opacity: 0.76 },
      },
    },
    size: {
      sm: { h: 'control.sm', px: '2', textStyle: 'ui.xs' },
      md: { h: 'control.md', px: '3', textStyle: 'ui.sm' },
    },
    block: { true: { w: 'full' } },
  },
  defaultVariants: { variant: 'secondary', size: 'md' },
})

export type ButtonVariants = NonNullable<RecipeVariantProps<typeof button>>

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    /** Lucide icon name shown before the label (or use the `icon` slot). */
    icon?: string
    /** Icon shown after the label. */
    iconEnd?: string
    loading?: boolean
    disabled?: boolean
    block?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'secondary', size: 'md', icon: undefined, iconEnd: undefined, loading: false, disabled: false, block: false, type: 'button' },
)

const classes = computed(() => button({ variant: props.variant, size: props.size, block: props.block }))
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <Spinner v-if="loading" />
    <slot v-else name="icon">
      <Icon v-if="icon" :name="icon" :size="14" aria-hidden="true" />
    </slot>
    <slot />
    <Icon v-if="iconEnd" :name="iconEnd" :size="14" aria-hidden="true" />
  </button>
</template>
