<script setup lang="ts" generic="T extends string | number">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { ref } from 'vue'
import { useSlidingIndicator } from '../motion/useSlidingIndicator'
import { stepIndex } from './lib/listNavigation'
import type { ControlSize, SegmentOption } from './types'

const props = withDefaults(
  defineProps<{
    options: SegmentOption<T>[]
    size?: ControlSize
    disabled?: boolean
    ariaLabel?: string
    /** Segments share the width equally (inspector rows) instead of hugging content. */
    fill?: boolean
  }>(),
  { size: 'md', disabled: false, ariaLabel: undefined, fill: true },
)

const model = defineModel<T>()
const root = ref<HTMLElement | null>(null)
const indicator = ref<HTMLElement | null>(null)
const buttons = ref<HTMLButtonElement[]>([])

function indexOfValue(): number {
  return props.options.findIndex((o) => o.value === model.value)
}

useSlidingIndicator({
  container: root,
  indicator,
  target: () => buttons.value[indexOfValue()] ?? null,
  source: () => model.value,
})

function select(index: number): void {
  const option = props.options[index]
  if (!option || option.disabled || props.disabled) return
  model.value = option.value
  buttons.value[index]?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
  const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
  if (!forward && !backward) return
  event.preventDefault()
  select(stepIndex(props.options, Math.max(0, indexOfValue()), forward ? 1 : -1))
}

const group = cva({
  base: {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    p: '0.5',
    gap: '0.5',
    borderRadius: 'sm',
    bg: 'bg.input',
    isolation: 'isolate',
  },
  variants: {
    size: { sm: { h: 'control.sm' }, md: { h: 'control.md' } },
    fill: { true: { w: 'full' }, false: { w: 'fit' } },
    disabled: { true: { opacity: 0.4, pointerEvents: 'none' } },
  },
})

const segment = cva({
  base: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1',
    minW: '0',
    px: '2',
    borderRadius: 'xs',
    color: 'fg.subtle',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transitionProperty: 'color',
    transitionDuration: 'fast',
    _hover: { color: 'fg.default' },
    _checked: { color: 'fg.default' },
    _focusVisible: { outlineOffset: '[-1px]' },
    _disabled: { opacity: 0.4, cursor: 'default' },
  },
  variants: {
    size: { sm: { textStyle: 'ui.xs' }, md: { textStyle: 'ui.sm' } },
    fill: { true: { flex: '1' } },
  },
})

const dotClass = css({
  position: 'absolute',
  top: '0.5',
  right: '0.5',
  w: '1',
  h: '1',
  borderRadius: 'full',
  bg: 'accent.default',
  pointerEvents: 'none',
})

const indicatorClass = css({
  position: 'absolute',
  top: '0.5',
  bottom: '0.5',
  left: '0',
  borderRadius: 'xs',
  bg: 'bg.active',
  borderWidth: '1px',
  borderColor: 'border.strong',
  opacity: 0,
  pointerEvents: 'none',
})
</script>

<template>
  <div ref="root" role="radiogroup" :aria-label="ariaLabel" :class="group({ size, fill, disabled })" @keydown="onKeydown">
    <span ref="indicator" :class="indicatorClass" aria-hidden="true" />
    <button
      v-for="(option, index) in options"
      :key="String(option.value)"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="option.value === model"
      :aria-label="option.label ? undefined : option.title"
      :title="option.title"
      :tabindex="option.value === model || (model === undefined && index === 0) ? 0 : -1"
      :disabled="option.disabled || disabled"
      :class="segment({ size, fill })"
      @click="select(index)"
    >
      <Icon v-if="option.icon" :name="option.icon" :size="14" aria-hidden="true" />
      <span v-if="option.label">{{ option.label }}</span>
      <span v-if="option.dot" :class="dotClass" aria-hidden="true" />
    </button>
  </div>
</template>
