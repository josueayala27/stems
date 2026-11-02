<script setup lang="ts" generic="T extends string">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { ref, useId } from 'vue'
import { useSlidingIndicator } from '../motion/useSlidingIndicator'
import { stepIndex } from './lib/listNavigation'
import type { TabItem } from './types'

const props = withDefaults(defineProps<{ tabs: TabItem<T>[]; ariaLabel?: string; size?: 'sm' | 'md' }>(), {
  ariaLabel: undefined,
  size: 'md',
})

const model = defineModel<T>({ required: true })

defineSlots<Record<string, (scope: { tab: TabItem<T> }) => unknown>>()

const id = useId()
const list = ref<HTMLElement | null>(null)
const indicator = ref<HTMLElement | null>(null)
const buttons = ref<HTMLButtonElement[]>([])

function currentIndex(): number {
  return props.tabs.findIndex((t) => t.value === model.value)
}

useSlidingIndicator({
  container: list,
  indicator,
  target: () => buttons.value[currentIndex()] ?? null,
  source: () => model.value,
})

function activate(index: number): void {
  const tab = props.tabs[index]
  if (!tab || tab.disabled) return
  model.value = tab.value
  buttons.value[index]?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  activate(stepIndex(props.tabs, Math.max(0, currentIndex()), event.key === 'ArrowRight' ? 1 : -1))
}

const tablist = css({
  position: 'relative',
  display: 'flex',
  gap: '3',
  px: '3',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
})

const tab = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1.5',
    color: 'fg.subtle',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transitionProperty: 'color',
    transitionDuration: 'fast',
    _hover: { color: 'fg.muted' },
    _selected: { color: 'fg.default' },
    _focusVisible: { outlineOffset: '[-2px]', borderRadius: 'xs' },
    _disabled: { opacity: 0.4, cursor: 'default' },
  },
  variants: {
    size: {
      sm: { h: 'control.lg', textStyle: 'ui.xs' },
      md: { h: '10', textStyle: 'ui.sm' },
    },
  },
})

const indicatorClass = css({
  position: 'absolute',
  bottom: '[-1px]',
  left: '0',
  h: '0.5',
  borderRadius: 'full',
  bg: 'fg.default',
  opacity: 0,
  pointerEvents: 'none',
})

const panel = css({ outline: 'none' })
</script>

<template>
  <div>
    <div ref="list" role="tablist" :aria-label="ariaLabel" :class="tablist" @keydown="onKeydown">
      <button
        v-for="(item, index) in tabs"
        :id="`${id}-tab-${item.value}`"
        :key="item.value"
        ref="buttons"
        type="button"
        role="tab"
        :aria-selected="item.value === model"
        :data-selected="item.value === model"
        :aria-controls="`${id}-panel-${item.value}`"
        :tabindex="item.value === model ? 0 : -1"
        :disabled="item.disabled"
        :class="tab({ size })"
        @click="activate(index)"
      >
        <Icon v-if="item.icon" :name="item.icon" :size="14" aria-hidden="true" />
        {{ item.label }}
      </button>
      <span ref="indicator" :class="indicatorClass" aria-hidden="true" />
    </div>
    <template v-for="item in tabs" :key="item.value">
      <div
        v-if="item.value === model && $slots[item.value]"
        :id="`${id}-panel-${item.value}`"
        role="tabpanel"
        :aria-labelledby="`${id}-tab-${item.value}`"
        tabindex="0"
        :class="panel"
      >
        <slot :name="item.value" :tab="item" />
      </div>
    </template>
  </div>
</template>
