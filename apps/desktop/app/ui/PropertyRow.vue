<script setup lang="ts">
import { css, cva } from 'styled-system/css'

withDefaults(
  defineProps<{
    label?: string
    for?: string
    align?: 'center' | 'start'
    /** `wide` fits longer labels (e.g. outside the inspector, where rows sit in a two-column grid). */
    labelWidth?: 'default' | 'wide'
  }>(),
  { label: undefined, for: undefined, align: 'center', labelWidth: 'default' },
)

defineSlots<{ default?: () => unknown; label?: () => unknown }>()

// Label column is fixed so controls line up across every section of the inspector.
// Variants (not class lists) so one property never comes from two competing atomic classes.
const row = cva({
  base: { display: 'grid', columnGap: '2', minH: 'control.md' },
  variants: {
    labelWidth: {
      default: { gridTemplateColumns: 'token(sizes.16) minmax(0, 1fr)' },
      wide: { gridTemplateColumns: 'token(sizes.24) minmax(0, 1fr)' },
    },
  },
})
const labelClass = css({
  display: 'flex',
  alignItems: 'center',
  minW: '0',
  h: 'control.md',
  textStyle: 'ui.xs',
  color: 'fg.muted',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
const control = cva({
  base: { display: 'flex', gap: '1.5', minW: '0' },
  variants: { align: { center: { alignItems: 'center' }, start: { alignItems: 'start' } } },
})
</script>

<template>
  <div :class="row({ labelWidth })">
    <label :class="labelClass" :for="$props.for">
      <slot name="label">{{ label }}</slot>
    </label>
    <div :class="control({ align })">
      <slot />
    </div>
  </div>
</template>
