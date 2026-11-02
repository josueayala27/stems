<script setup lang="ts">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { useId } from 'vue'
import MotionTransition from '../motion/MotionTransition.vue'
import { usePersistentState } from './composables/usePersistentState'

const props = withDefaults(
  defineProps<{
    title: string
    collapsible?: boolean
    /** Initial open state when nothing is stored. */
    defaultOpen?: boolean
    /** Persist the open state in localStorage under this key. */
    storageKey?: string
    /** Hide the bottom divider (last section). */
    flush?: boolean
  }>(),
  { collapsible: false, defaultOpen: true, storageKey: undefined, flush: false },
)

const emit = defineEmits<{ toggle: [open: boolean] }>()
const stored = usePersistentState<boolean>(props.storageKey, props.defaultOpen)

function toggle(): void {
  if (!props.collapsible) return
  stored.value = !stored.value
  emit('toggle', stored.value)
}

defineSlots<{ default?: () => unknown; actions?: () => unknown }>()

const id = useId()

const section = cva({
  base: { borderColor: 'border.default', py: '2' },
  variants: { flush: { false: { borderBottomWidth: '1px' } } },
})
const header = css({ display: 'flex', alignItems: 'center', gap: '1', h: 'control.md', pl: '3', pr: '2' })
const titleButton = cva({
  base: {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    gap: '1',
    minW: '0',
    h: 'full',
    textStyle: 'ui.label',
    color: 'fg.default',
    textAlign: 'left',
    borderRadius: 'xs',
    '& [data-part=chevron]': {
      color: 'fg.subtle',
      transitionProperty: 'transform, opacity',
      transitionDuration: 'fast',
      transitionTimingFunction: 'standard',
    },
    '&[aria-expanded=false] [data-part=chevron]': { transform: 'rotate(-90deg)' },
  },
  variants: {
    collapsible: {
      true: { cursor: 'pointer', '& [data-part=chevron]': { opacity: 0 }, _hover: { '& [data-part=chevron]': { opacity: 1 } }, _focusVisible: { '& [data-part=chevron]': { opacity: 1 } }, '&[aria-expanded=false] [data-part=chevron]': { opacity: 1 } },
      false: { cursor: 'default' },
    },
  },
})
const actions = css({ display: 'flex', alignItems: 'center', gap: '0.5', ml: 'auto' })
const body = css({ display: 'flex', flexDirection: 'column', gap: '1.5', px: '3', pt: '1.5', pb: '1' })
</script>

<template>
  <section :class="section({ flush })">
    <div :class="header">
      <button
        type="button"
        :class="titleButton({ collapsible })"
        :aria-expanded="collapsible ? stored : undefined"
        :aria-controls="`${id}-body`"
        :tabindex="collapsible ? 0 : -1"
        @click="toggle"
      >
        <span>{{ title }}</span>
        <Icon v-if="collapsible" data-part="chevron" name="lucide:chevron-down" :size="12" aria-hidden="true" />
      </button>
      <div v-if="$slots.actions" :class="actions"><slot name="actions" /></div>
    </div>
    <MotionTransition preset="collapse">
      <div v-if="!collapsible || stored" :id="`${id}-body`">
        <div :class="body"><slot /></div>
      </div>
    </MotionTransition>
  </section>
</template>
