<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed, ref, useId, watch } from 'vue'
import { useListNavigation } from './composables/useListNavigation'
import ListItem from './ListItem.vue'
import { edgeIndex } from './lib/listNavigation'
import { isMenuItem, type MenuEntry, type MenuItem } from './types'

const props = withDefaults(
  defineProps<{
    items: MenuEntry[]
    /** Highlight the first item immediately (keyboard-opened menus). */
    autoActivate?: boolean
    ariaLabel?: string
  }>(),
  { autoActivate: false, ariaLabel: undefined },
)

const emit = defineEmits<{
  select: [item: MenuItem]
  close: []
}>()

const id = useId()
const activeIndex = ref(-1)
const navItems = computed(() =>
  props.items.map((entry) => (isMenuItem(entry) ? { label: entry.label, disabled: entry.disabled } : { disabled: true })),
)
const hasChecks = computed(() => props.items.some((e) => isMenuItem(e) && e.checked !== undefined))

watch(
  () => [props.items, props.autoActivate] as const,
  () => (activeIndex.value = props.autoActivate ? edgeIndex(navItems.value, 'first') : -1),
  { immediate: true },
)

function choose(index: number): void {
  const entry = props.items[index]
  if (!entry || !isMenuItem(entry) || entry.disabled) return
  emit('select', entry)
  emit('close')
}

const { onKeydown } = useListNavigation({ items: () => navItems.value, activeIndex, onSelect: choose })

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    event.preventDefault()
    emit('close')
    return
  }
  onKeydown(event)
}

function itemId(index: number): string {
  return `${id}-${index}`
}

const list = css({ display: 'flex', flexDirection: 'column', outline: 'none', _focusVisible: { outline: 'none' } })
const separator = css({ h: '[1px]', my: '1', mx: '-1', bg: 'border.default' })
const groupLabel = css({ px: '2', pt: '1.5', pb: '1', textStyle: 'ui.label', color: 'fg.subtle' })
</script>

<template>
  <div
    role="menu"
    tabindex="0"
    data-autofocus
    :aria-label="ariaLabel"
    :aria-activedescendant="activeIndex >= 0 ? itemId(activeIndex) : undefined"
    :class="list"
    @keydown="handleKeydown"
    @pointerleave="activeIndex = -1"
  >
    <template v-for="(entry, index) in items" :key="index">
      <div v-if="entry.type === 'separator'" role="separator" :class="separator" />
      <div v-else-if="entry.type === 'label'" role="presentation" :class="groupLabel">{{ entry.label }}</div>
      <ListItem
        v-else
        :id="itemId(index)"
        :role="entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
        :aria-checked="entry.checked"
        :label="entry.label"
        :icon="entry.icon"
        :shortcut="entry.shortcut"
        :disabled="entry.disabled"
        :danger="entry.danger"
        :checked="entry.checked"
        :show-check="hasChecks"
        :active="activeIndex === index"
        @pointermove="!entry.disabled && (activeIndex = index)"
        @click="choose(index)"
      />
    </template>
  </div>
</template>
