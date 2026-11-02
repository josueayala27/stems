<script setup lang="ts">
import { Icon } from '#components'
import { css } from 'styled-system/css'
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{ label?: string; disabled?: boolean; indeterminate?: boolean; /** For checkboxes without a visible label. */ ariaLabel?: string }>(), {
  label: undefined,
  ariaLabel: undefined,
  disabled: false,
  indeterminate: false,
})

const model = defineModel<boolean>({ default: false })
const id = useId()
const ariaChecked = computed(() => (props.indeterminate ? 'mixed' : model.value))

function toggle(): void {
  model.value = props.indeterminate ? true : !model.value
}

const root = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  textStyle: 'ui.sm',
  color: 'fg.default',
  cursor: 'pointer',
  _disabled: { opacity: 0.4, pointerEvents: 'none' },
})

const box = css({
  display: 'grid',
  placeItems: 'center',
  w: '3.5',
  h: '3.5',
  flexShrink: 0,
  borderRadius: 'xs',
  borderWidth: '1px',
  borderColor: 'border.strong',
  bg: 'bg.input',
  color: 'fg.onAccent',
  cursor: 'pointer',
  transitionProperty: 'background-color, border-color',
  transitionDuration: 'fast',
  _hover: { borderColor: 'fg.subtle' },
  '&[aria-checked=true], &[aria-checked=mixed]': { bg: 'accent.default', borderColor: 'accent.default' },
  _disabled: { opacity: 0.4, pointerEvents: 'none' },
})
</script>

<template>
  <span :class="root" :data-disabled="disabled || undefined">
    <button
      :id="id"
      type="button"
      role="checkbox"
      :aria-checked="ariaChecked"
      :aria-label="ariaLabel"
      :disabled="disabled"
      :class="box"
      @click="toggle"
    >
      <Icon v-if="indeterminate" name="lucide:minus" :size="10" aria-hidden="true" />
      <Icon v-else-if="model" name="lucide:check" :size="10" aria-hidden="true" />
    </button>
    <label v-if="label || $slots.default" :for="id"><slot>{{ label }}</slot></label>
  </span>
</template>
