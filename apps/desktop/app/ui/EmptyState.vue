<script setup lang="ts">
import { Icon } from '#components'
import { css } from 'styled-system/css'

withDefaults(
  defineProps<{
    /** Lucide icon name. */
    icon?: string
    title: string
    description?: string
    /** `sm` for panels and table bodies, `md` for full workspaces. */
    size?: 'sm' | 'md'
  }>(),
  { icon: undefined, description: undefined, size: 'md' },
)

defineSlots<{ default?: () => unknown; actions?: () => unknown }>()

const root = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2',
  textAlign: 'center',
  color: 'fg.muted',
  '&[data-size=sm]': { p: '4' },
  '&[data-size=md]': { p: '8', minH: '[240px]' },
})
const mark = css({ display: 'grid', placeItems: 'center', w: '10', h: '10', mb: '1', borderRadius: 'md', bg: 'bg.subtle', color: 'fg.muted' })
const titleClass = css({ textStyle: 'ui.title', color: 'fg.default' })
const descriptionClass = css({ textStyle: 'ui.sm', color: 'fg.muted', maxW: '[360px]' })
const actions = css({ display: 'flex', gap: '2', mt: '2' })
</script>

<template>
  <div :class="root" :data-size="size">
    <span v-if="icon" :class="mark"><Icon :name="icon" :size="20" aria-hidden="true" /></span>
    <p :class="titleClass">{{ title }}</p>
    <p v-if="description" :class="descriptionClass">{{ description }}</p>
    <slot />
    <div v-if="$slots.actions" :class="actions"><slot name="actions" /></div>
  </div>
</template>
