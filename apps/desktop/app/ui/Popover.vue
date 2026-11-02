<script setup lang="ts">
import { cva } from 'styled-system/css'
import { css } from 'styled-system/css'
import { computed, nextTick, ref, useId, watch } from 'vue'
import MotionTransition from '../motion/MotionTransition.vue'
import { useDismissableLayer } from './composables/useDismissableLayer'
import { useFloatingSurface, type Placement, type ReferenceElement } from './composables/useFloatingSurface'
import { useSlotAnchor } from './composables/useSlotAnchor'

// Fragment root (trigger wrapper + Teleport): attrs go to the floating surface.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    placement?: Placement
    /** Gap to the anchor in px. */
    offset?: number
    /** Surface is at least as wide as the anchor. */
    matchWidth?: boolean
    /** External or virtual anchor (e.g. pointer position). Defaults to the trigger slot's element. */
    anchor?: ReferenceElement | null
    role?: 'dialog' | 'menu' | 'listbox'
    /** What receives focus on open: first focusable / `[data-autofocus]`, the surface, or nothing. */
    autoFocus?: 'first' | 'surface' | 'none'
    padding?: 'none' | 'sm' | 'md'
    ariaLabel?: string
  }>(),
  {
    placement: 'bottom-start',
    offset: 6,
    matchWidth: false,
    anchor: null,
    role: 'dialog',
    autoFocus: 'first',
    padding: 'sm',
    ariaLabel: undefined,
  },
)

const open = defineModel<boolean>('open', { default: false })

defineSlots<{
  trigger?: (scope: {
    open: boolean
    toggle: () => void
    close: () => void
    props: { 'aria-expanded': boolean; 'aria-haspopup': 'dialog' | 'menu' | 'listbox'; 'aria-controls': string | undefined; onClick: () => void }
  }) => unknown
  default?: (scope: { close: () => void }) => unknown
}>()

const id = useId()
const surface = ref<HTMLElement | null>(null)
const { wrapper, anchor: slotAnchor } = useSlotAnchor()
const reference = computed<ReferenceElement | null>(() => props.anchor ?? slotAnchor.value)
const { floatingStyles, placement: resolvedPlacement } = useFloatingSurface(reference, surface, {
  open,
  placement: () => props.placement,
  offset: props.offset,
  matchWidth: props.matchWidth,
})

function close(): void {
  open.value = false
}

function toggle(): void {
  open.value = !open.value
}

useDismissableLayer({
  open,
  elements: () => [surface.value, reference.value instanceof Element ? reference.value : null],
  onDismiss: close,
})

const FOCUSABLE = '[data-autofocus], input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
let returnFocusTo: HTMLElement | null = null

watch(open, async (value) => {
  if (value) {
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    const el = surface.value
    if (!el || props.autoFocus === 'none') return
    const target = props.autoFocus === 'first' ? (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE)) : null
    ;(target ?? el).focus({ preventScroll: true })
    return
  }
  // Restore focus only if it was inside the surface (or lost), not if the user clicked elsewhere.
  const active = document.activeElement
  const lost = !active || active === document.body || surface.value?.contains(active)
  if (lost && returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true })
  returnFocusTo = null
})

const triggerProps = computed(() => ({
  'aria-expanded': open.value,
  'aria-haspopup': props.role,
  'aria-controls': open.value ? id : undefined,
  onClick: toggle,
}))

const surfaceRecipe = cva({
  base: {
    zIndex: 'popover',
    minW: '40',
    overflowY: 'auto',
    bg: 'bg.elevated',
    color: 'fg.default',
    borderRadius: 'md',
    boxShadow: 'popover',
    outline: 'none',
    _focusVisible: { outline: 'none' },
  },
  variants: {
    padding: {
      none: { p: '0' },
      sm: { p: '1' },
      md: { p: '3' },
    },
  },
})

const contents = css({ display: 'contents' })

defineExpose({ close, surface })
</script>

<template>
  <span v-if="$slots.trigger" ref="wrapper" :class="contents">
    <slot name="trigger" :open="open" :toggle="toggle" :close="close" :props="triggerProps" />
  </span>
  <Teleport to="body">
    <MotionTransition preset="popover">
      <div
        v-if="open"
        v-bind="$attrs"
        :id="id"
        ref="surface"
        :role="role === 'dialog' ? 'dialog' : undefined"
        :aria-label="ariaLabel"
        tabindex="-1"
        :class="surfaceRecipe({ padding })"
        :style="floatingStyles"
        :data-placement="resolvedPlacement"
      >
        <slot :close="close" />
      </div>
    </MotionTransition>
  </Teleport>
</template>
