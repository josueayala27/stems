<script setup lang="ts">
import { css } from 'styled-system/css'
import { shallowRef } from 'vue'
import type { ReferenceElement } from './composables/useFloatingSurface'
import MenuList from './MenuList.vue'
import Popover from './Popover.vue'
import type { MenuEntry, MenuItem } from './types'

// Fragment root (area + Popover): attrs go to the menu surface.
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{ items: MenuEntry[]; disabled?: boolean; ariaLabel?: string }>(), {
  disabled: false,
  ariaLabel: undefined,
})

const emit = defineEmits<{ select: [id: string, item: MenuItem]; open: [event: MouseEvent | null] }>()
const open = defineModel<boolean>('open', { default: false })
const anchor = shallowRef<ReferenceElement | null>(null)

function pointAnchor(x: number, y: number): ReferenceElement {
  return { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) }
}

/** Opens the menu at viewport coordinates (for callers that handle the event themselves, e.g. the canvas). */
function openAt(x: number, y: number): void {
  anchor.value = pointAnchor(x, y)
  open.value = true
}

function onContextMenu(event: MouseEvent): void {
  if (props.disabled) return
  event.preventDefault()
  emit('open', event)
  openAt(event.clientX, event.clientY)
}

const area = css({ display: 'contents' })

defineExpose({ openAt, close: () => (open.value = false) })
</script>

<template>
  <div :class="area" @contextmenu="onContextMenu">
    <slot />
  </div>
  <Popover v-bind="$attrs" v-model:open="open" :anchor="anchor" placement="right-start" role="menu" :offset="2">
    <MenuList
      :items="items"
      :aria-label="ariaLabel"
      @select="(item) => emit('select', item.id, item)"
      @close="open = false"
    />
  </Popover>
</template>
