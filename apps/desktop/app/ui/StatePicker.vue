<script setup lang="ts">
import { computed } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import type { ControlSize, SegmentOption } from './types'

export type StyleState = 'default' | 'hover' | 'focus' | 'active'

export interface StateOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    /** States that carry style overrides; they get an accent dot. */
    overridden?: string[]
    /** Defaults to Default / Hover / Focus / Active. */
    states?: StateOption[]
    size?: ControlSize
    disabled?: boolean
    ariaLabel?: string
  }>(),
  {
    overridden: () => [],
    states: () => [
      { value: 'default', label: 'Default' },
      { value: 'hover', label: 'Hover' },
      { value: 'focus', label: 'Focus' },
      { value: 'active', label: 'Active' },
    ],
    size: 'sm',
    disabled: false,
    ariaLabel: 'Style state',
  },
)

/** Selected state value; `'default'` is the base style. */
const model = defineModel<string>({ default: 'default' })

const options = computed<SegmentOption<string>[]>(() =>
  props.states.map((state) => {
    const dot = props.overridden.includes(state.value)
    return {
      value: state.value,
      label: state.label,
      dot,
      title: dot ? `${state.label} (has overrides)` : state.label,
    }
  }),
)
</script>

<template>
  <SegmentedControl v-model="model" :options="options" :size="size" :disabled="disabled" :aria-label="ariaLabel" />
</template>
