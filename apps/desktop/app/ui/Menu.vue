<script setup lang="ts">
import { ref } from 'vue'
import type { Placement } from './composables/useFloatingSurface'
import MenuList from './MenuList.vue'
import Popover from './Popover.vue'
import type { MenuEntry, MenuItem } from './types'

// Attrs are forwarded to the menu surface.
defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    items: MenuEntry[]
    placement?: Placement
    ariaLabel?: string
  }>(),
  { placement: 'bottom-start', ariaLabel: undefined },
)

const emit = defineEmits<{ select: [id: string, item: MenuItem] }>()
const open = defineModel<boolean>('open', { default: false })

defineSlots<{
  trigger: (scope: {
    open: boolean
    props: {
      'aria-expanded': boolean
      'aria-haspopup': 'menu'
      onClick: (event: MouseEvent) => void
      onKeydown: (event: KeyboardEvent) => void
    }
  }) => unknown
}>()

const keyboardOpened = ref(false)

function onTriggerClick(event: MouseEvent): void {
  // `detail === 0` means the click came from Enter/Space.
  keyboardOpened.value = event.detail === 0
  open.value = !open.value
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  keyboardOpened.value = true
  open.value = true
}
</script>

<template>
  <Popover v-bind="$attrs" v-model:open="open" :placement="placement" role="menu" :offset="4">
    <template #trigger>
      <slot
        name="trigger"
        :open="open"
        :props="{ 'aria-expanded': open, 'aria-haspopup': 'menu', onClick: onTriggerClick, onKeydown: onTriggerKeydown }"
      />
    </template>
    <MenuList
      :items="items"
      :auto-activate="keyboardOpened"
      :aria-label="ariaLabel"
      @select="(item) => emit('select', item.id, item)"
      @close="open = false"
    />
  </Popover>
</template>
