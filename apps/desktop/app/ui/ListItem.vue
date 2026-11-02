<script setup lang="ts">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import Kbd from './Kbd.vue'

// Presentational row shared by Menu and Select surfaces. Focus stays on the
// list container (aria-activedescendant), so the row itself is not focusable.
withDefaults(
  defineProps<{
    label: string
    icon?: string
    shortcut?: string
    active?: boolean
    disabled?: boolean
    danger?: boolean
    /** Reserve space for and show a trailing check mark. */
    checked?: boolean
    showCheck?: boolean
  }>(),
  { icon: undefined, shortcut: undefined, active: false, disabled: false, danger: false, checked: false, showCheck: false },
)

const row = cva({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '2',
    h: 'control.md',
    px: '2',
    borderRadius: 'xs',
    textStyle: 'ui.sm',
    color: 'fg.default',
    cursor: 'default',
    whiteSpace: 'nowrap',
    '& [data-part=icon]': { color: 'fg.muted' },
  },
  variants: {
    active: { true: { bg: 'accent.default', color: 'fg.onAccent', '& [data-part=icon], & kbd span': { color: 'fg.onAccent' } } },
    danger: { true: { color: 'danger.default', '& [data-part=icon]': { color: 'danger.default' } } },
    disabled: { true: { opacity: 0.4 } },
  },
  compoundVariants: [{ active: true, danger: true, css: { bg: 'danger.default', color: 'fg.onAccent', '& [data-part=icon]': { color: 'fg.onAccent' } } }],
})
const labelClass = css({ flex: '1', minW: '0', overflow: 'hidden', textOverflow: 'ellipsis' })
const hidden = css({ visibility: 'hidden' })
</script>

<template>
  <div :class="row({ active, danger, disabled })" :aria-disabled="disabled || undefined">
    <Icon v-if="icon" data-part="icon" :name="icon" :size="14" aria-hidden="true" />
    <span :class="labelClass">{{ label }}</span>
    <Kbd v-if="shortcut" :shortcut="shortcut" tone="subtle" />
    <Icon v-if="showCheck" data-part="icon" name="lucide:check" :size="14" :class="!checked && hidden" aria-hidden="true" />
  </div>
</template>
