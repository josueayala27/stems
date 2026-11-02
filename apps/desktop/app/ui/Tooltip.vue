<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { css } from 'styled-system/css'
import { onBeforeUnmount, ref, useId, watch } from 'vue'
import MotionTransition from '../motion/MotionTransition.vue'
import { useFloatingSurface, type Placement } from './composables/useFloatingSurface'
import { useSlotAnchor } from './composables/useSlotAnchor'
import { useTooltipGroup } from './composables/uiContext'
import Kbd from './Kbd.vue'

// Fragment root (anchor wrapper + Teleport): attrs style the bubble.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    content: string
    /** Shortcut shown next to the text, e.g. `'Mod+D'`. */
    shortcut?: string
    placement?: Placement
    /** Hover delay in ms; skipped when another tooltip was just open. */
    delay?: number
    disabled?: boolean
  }>(),
  { shortcut: undefined, placement: 'bottom', delay: 400, disabled: false },
)

const id = useId()
const tooltipTiming = useTooltipGroup()
const open = ref(false)
const surface = ref<HTMLElement | null>(null)
const { wrapper, anchor } = useSlotAnchor()
const { floatingStyles, placement: resolvedPlacement } = useFloatingSurface(anchor, surface, {
  open,
  placement: () => props.placement,
  offset: 6,
})

let timer: ReturnType<typeof setTimeout> | undefined

function show(): void {
  if (props.disabled || open.value) return
  clearTimeout(timer)
  const delay = tooltipTiming.delayFor(props.delay)
  if (delay === 0) open.value = true
  else timer = setTimeout(() => (open.value = true), delay)
}

function hide(): void {
  clearTimeout(timer)
  open.value = false
}

useEventListener(anchor, 'pointerenter', show)
useEventListener(anchor, 'pointerleave', hide)
useEventListener(anchor, 'pointerdown', hide)
useEventListener(anchor, 'focusin', (event: FocusEvent) => {
  // Only keyboard focus shows the tooltip; clicks already hide it.
  if (event.target instanceof Element && event.target.matches(':focus-visible')) show()
})
useEventListener(anchor, 'focusout', hide)
useEventListener(anchor, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && open.value) hide()
})

watch(open, (value) => (value ? tooltipTiming.opened() : tooltipTiming.closed()))
watch([open, anchor], ([value, el]) => {
  if (!el) return
  if (value) el.setAttribute('aria-describedby', id)
  else el.removeAttribute('aria-describedby')
})
watch(
  () => props.disabled,
  (disabled) => disabled && hide(),
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  if (open.value) tooltipTiming.closed()
})

const contents = css({ display: 'contents' })
const bubble = css({
  zIndex: 'tooltip',
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  maxW: '64',
  px: '2',
  py: '1',
  borderRadius: 'sm',
  bg: 'bg.elevated',
  color: 'fg.default',
  textStyle: 'ui.xs',
  boxShadow: 'popover',
  pointerEvents: 'none',
})
</script>

<template>
  <span ref="wrapper" :class="contents"><slot /></span>
  <Teleport to="body">
    <MotionTransition preset="tooltip">
      <div
        v-if="open"
        v-bind="$attrs"
        :id="id"
        ref="surface"
        role="tooltip"
        :class="bubble"
        :style="floatingStyles"
        :data-placement="resolvedPlacement"
      >
        <span>{{ content }}</span>
        <Kbd v-if="shortcut" :shortcut="shortcut" tone="subtle" />
      </div>
    </MotionTransition>
  </Teleport>
</template>
