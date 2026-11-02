<script setup lang="ts" generic="T extends string | number">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { computed, ref, useId, watch } from 'vue'
import { useListNavigation } from './composables/useListNavigation'
import ListItem from './ListItem.vue'
import { edgeIndex } from './lib/listNavigation'
import Popover from './Popover.vue'
import type { ControlSize, SelectOption } from './types'

// Root is a Popover (fragment): attrs go to the trigger button.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    options: SelectOption<T>[]
    placeholder?: string
    size?: ControlSize
    disabled?: boolean
    /** Shown instead of the selected label when the selection spans different values. */
    mixed?: boolean
    ariaLabel?: string
  }>(),
  { placeholder: 'Select…', size: 'md', disabled: false, mixed: false, ariaLabel: undefined },
)

const model = defineModel<T>()
const open = ref(false)
const activeIndex = ref(-1)
const id = useId()

const selectedIndex = computed(() => props.options.findIndex((o) => o.value === model.value))
const selected = computed(() => (props.mixed ? undefined : props.options[selectedIndex.value]))

watch(open, (value) => {
  if (value) activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : edgeIndex(props.options, 'first')
})

function choose(index: number): void {
  const option = props.options[index]
  if (!option || option.disabled) return
  model.value = option.value
  open.value = false
}

const { onKeydown } = useListNavigation({ items: () => props.options, activeIndex, onSelect: choose })

function onListKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    open.value = false
    return
  }
  onKeydown(event)
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
  }
}

function optionId(index: number): string {
  return `${id}-opt-${index}`
}

const trigger = cva({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5',
    w: 'full',
    minW: '0',
    pl: '2',
    pr: '1.5',
    borderRadius: 'sm',
    bg: 'bg.input',
    color: 'fg.default',
    borderWidth: '1px',
    borderColor: 'transparent',
    textAlign: 'left',
    cursor: 'default',
    transitionProperty: 'border-color, background-color',
    transitionDuration: 'fast',
    _hover: { borderColor: 'border.default' },
    _expanded: { borderColor: 'accent.default' },
    _focusVisible: { outline: 'none', borderColor: 'accent.default' },
    _disabled: { opacity: 0.4, pointerEvents: 'none' },
    '& [data-part=icon]': { color: 'fg.muted', flexShrink: 0 },
  },
  variants: {
    size: {
      sm: { h: 'control.sm', textStyle: 'ui.xs' },
      md: { h: 'control.md', textStyle: 'ui.sm' },
    },
  },
})

const valueText = css({ flex: '1', minW: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const placeholderText = css({ color: 'fg.subtle' })
const list = css({ display: 'flex', flexDirection: 'column', outline: 'none', _focusVisible: { outline: 'none' } })
</script>

<template>
  <Popover v-model:open="open" role="listbox" match-width :offset="4">
    <template #trigger>
      <button
        v-bind="$attrs"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="open ? `${id}-list` : undefined"
        :aria-label="ariaLabel"
        :disabled="disabled"
        :class="trigger({ size })"
        @click="open = !open"
        @keydown="onTriggerKeydown"
      >
        <Icon v-if="selected?.icon" data-part="icon" :name="selected.icon" :size="14" aria-hidden="true" />
        <span :class="[valueText, !selected && placeholderText]">{{ mixed ? 'Mixed' : (selected?.label ?? placeholder) }}</span>
        <Icon data-part="icon" name="lucide:chevrons-up-down" :size="12" aria-hidden="true" />
      </button>
    </template>
    <div
      :id="`${id}-list`"
      role="listbox"
      tabindex="0"
      data-autofocus
      :aria-label="ariaLabel"
      :aria-activedescendant="activeIndex >= 0 ? optionId(activeIndex) : undefined"
      :class="list"
      @keydown="onListKeydown"
    >
      <ListItem
        v-for="(option, index) in options"
        :id="optionId(index)"
        :key="String(option.value)"
        role="option"
        :aria-selected="index === selectedIndex"
        :label="option.label"
        :icon="option.icon"
        :disabled="option.disabled"
        :active="index === activeIndex"
        :checked="index === selectedIndex"
        show-check
        @pointermove="!option.disabled && (activeIndex = index)"
        @click="choose(index)"
      />
    </div>
  </Popover>
</template>
