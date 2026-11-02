<script setup lang="ts">
import { css, cva } from 'styled-system/css'
import ScrollArea from './ScrollArea.vue'

withDefaults(defineProps<{ title?: string; bordered?: 'left' | 'right' | 'none' | 'all' }>(), {
  title: undefined,
  bordered: 'none',
})

defineSlots<{ default?: () => unknown; header?: () => unknown; actions?: () => unknown; footer?: () => unknown }>()

const panel = cva({
  base: { display: 'flex', flexDirection: 'column', minH: '0', h: 'full', bg: 'bg.panel', color: 'fg.default', borderColor: 'border.default' },
  variants: {
    bordered: {
      none: {},
      left: { borderLeftWidth: '1px' },
      right: { borderRightWidth: '1px' },
      all: { borderWidth: '1px', borderRadius: 'md', overflow: 'hidden' },
    },
  },
})
const header = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  h: '10',
  px: '3',
  flexShrink: 0,
  borderBottomWidth: '1px',
  borderColor: 'border.default',
})
const titleClass = css({ flex: '1', textStyle: 'ui.title', color: 'fg.default' })
const footer = css({ flexShrink: 0, borderTopWidth: '1px', borderColor: 'border.default', p: '3' })
const body = css({ flex: '1' })
</script>

<template>
  <section :class="panel({ bordered })">
    <header v-if="title || $slots.header" :class="header">
      <slot name="header">
        <h2 :class="titleClass">{{ title }}</h2>
        <slot name="actions" />
      </slot>
    </header>
    <ScrollArea :class="body">
      <slot />
    </ScrollArea>
    <footer v-if="$slots.footer" :class="footer"><slot name="footer" /></footer>
  </section>
</template>
