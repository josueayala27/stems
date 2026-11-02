<script setup lang="ts">
import { css, cva } from 'styled-system/css'
import { computed, ref, useId } from 'vue'
import MotionTransition from '../motion/MotionTransition.vue'
import IconButton from './IconButton.vue'
import { useModal } from './composables/useModal'
import type { DismissReason } from './composables/useDismissableLayer'

// Side panel modal (record details, filters). Fragment root: attrs go to the panel.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    /** Edge the sheet is attached to. */
    side?: 'right' | 'left'
    size?: 'sm' | 'md' | 'lg'
    /** Esc and a press on the backdrop close the sheet. */
    dismissible?: boolean
    /** Shows the close (×) button in the header. */
    closeButton?: boolean
    closeLabel?: string
    /** Label for screen readers when there is no visible title. */
    ariaLabel?: string
  }>(),
  {
    title: undefined,
    description: undefined,
    side: 'right',
    size: 'md',
    dismissible: true,
    closeButton: true,
    closeLabel: 'Close',
    ariaLabel: undefined,
  },
)

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  /** The user closed the sheet: Esc, backdrop press or the close button. */
  dismiss: [reason: DismissReason | 'close']
}>()

defineSlots<{
  trigger?: (scope: { open: () => void; props: { 'aria-haspopup': 'dialog'; 'aria-expanded': boolean; onClick: () => void } }) => unknown
  /** Replaces the title/description block (the close button stays). */
  header?: (scope: { titleId: string; descriptionId: string }) => unknown
  default?: (scope: { close: () => void }) => unknown
  footer?: (scope: { close: () => void }) => unknown
}>()

const id = useId()
const titleId = `${id}-title`
const descriptionId = `${id}-description`
const panel = ref<HTMLElement | null>(null)

function show(): void {
  open.value = true
}

function close(): void {
  open.value = false
}

function dismiss(reason: DismissReason | 'close'): void {
  emit('dismiss', reason)
  close()
}

useModal({ open, panel, dismissible: () => props.dismissible, onDismiss: dismiss })

const triggerProps = computed(() => ({ 'aria-haspopup': 'dialog' as const, 'aria-expanded': open.value, onClick: show }))
const hasHeader = computed(() => Boolean(props.title || props.description || props.closeButton))

const backdrop = css({ position: 'fixed', inset: '0', zIndex: 'modal', bg: 'bg.backdrop' })
const panelRecipe = cva({
  base: {
    position: 'fixed',
    top: '0',
    bottom: '0',
    zIndex: 'modal',
    display: 'flex',
    flexDirection: 'column',
    w: 'full',
    bg: 'bg.panel',
    color: 'fg.default',
    boxShadow: 'popover',
    outline: 'none',
  },
  variants: {
    side: {
      right: { right: '0', borderLeftWidth: '1px', borderColor: 'border.default' },
      left: { left: '0', borderRightWidth: '1px', borderColor: 'border.default' },
    },
    size: {
      sm: { maxW: '[360px]' },
      md: { maxW: '[480px]' },
      lg: { maxW: '[640px]' },
    },
  },
})
const header = css({ display: 'flex', alignItems: 'flex-start', gap: '2', px: '4', py: '3', borderBottomWidth: '1px', borderColor: 'border.default' })
const headerText = css({ display: 'flex', flexDirection: 'column', gap: '1', flex: '1', minW: '0' })
const titleClass = css({ textStyle: 'ui.title', color: 'fg.default' })
const descriptionClass = css({ textStyle: 'ui.sm', color: 'fg.muted' })
const closeSlot = css({ mt: '-1', mr: '-1' })
const body = css({ flex: '1', minH: '0', overflowY: 'auto', p: '4', textStyle: 'ui.sm' })
const footer = css({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '2',
  px: '4',
  py: '3',
  mt: '2',
  borderTopWidth: '1px',
  borderColor: 'border.default',
})

defineExpose({ open: show, close, panel })
</script>

<template>
  <slot name="trigger" :open="show" :props="triggerProps" />
  <Teleport to="body">
    <MotionTransition preset="backdrop">
      <div v-if="open" :class="backdrop" aria-hidden="true" data-part="backdrop" />
    </MotionTransition>
    <MotionTransition preset="sheet" :placement="side">
        <div
          v-if="open"
          v-bind="$attrs"
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title || $slots.header ? titleId : undefined"
          :aria-describedby="description || $slots.header ? descriptionId : undefined"
          :aria-label="ariaLabel"
          tabindex="-1"
          :class="panelRecipe({ side, size })"
          :data-side="side"
        >
          <header v-if="hasHeader || $slots.header" :class="header" data-part="header">
            <div :class="headerText">
              <slot name="header" :title-id="titleId" :description-id="descriptionId">
                <h2 v-if="title" :id="titleId" :class="titleClass">{{ title }}</h2>
                <p v-if="description" :id="descriptionId" :class="descriptionClass">{{ description }}</p>
              </slot>
            </div>
            <span v-if="closeButton" :class="closeSlot">
              <IconButton icon="lucide:x" :label="closeLabel" size="sm" :tooltip="false" @click="dismiss('close')" />
            </span>
          </header>
          <div :class="body">
            <slot :close="close" />
          </div>
          <footer v-if="$slots.footer" :class="footer">
            <slot name="footer" :close="close" />
          </footer>
        </div>
    </MotionTransition>
  </Teleport>
</template>
