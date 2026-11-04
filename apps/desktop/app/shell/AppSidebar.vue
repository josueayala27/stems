<script setup lang="ts">
import { css } from 'styled-system/css'
import { Icon, NuxtLink } from '#components'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayer } from '~/engine/player'
import { NAV_SECTIONS, isNavActive, type NavItem } from './nav'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const route = useRoute()
const output = computed(() => usePlayer().output.value)

function isActive(item: NavItem): boolean {
  return isNavActive(item, route.path)
}

const root = css({ display: 'flex', flexDirection: 'column', h: 'full', minH: '0' })
const nav = css({ flex: '1', minH: '0', overflowY: 'auto', px: '2', py: '3' })
const section = css({ display: 'flex', flexDirection: 'column', gap: '0.5', mb: '5' })
const sectionTitle = css({ px: '2', mb: '1', textStyle: 'ui.label', color: 'fg.subtle', textTransform: 'uppercase' })
const divider = css({ h: '[1px]', mx: '2', mb: '2', bg: 'border.default' })
const link = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2.5',
  h: 'control.lg',
  px: '2',
  borderLeftWidth: '2px',
  borderColor: 'transparent',
  borderRadius: 'sm',
  color: 'fg.muted',
  textStyle: 'ui.sm',
  transitionProperty: 'background, color',
  transitionDuration: 'fast',
  transitionTimingFunction: 'standard',
  _hover: { bg: 'bg.hover', color: 'fg.default' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[-2px]' },
})
const linkCollapsed = css({ justifyContent: 'center', px: '0' })
const linkActive = css({ bg: 'bg.subtle', color: 'fg.default', borderColor: 'accent.default' })
const footer = css({ flexShrink: '0', p: '3', borderTopWidth: '1px', borderColor: 'border.default' })
const status = css({ display: 'flex', alignItems: 'center', gap: '2.5', p: '2.5', borderRadius: 'md', bg: 'bg.canvas', borderWidth: '1px', borderColor: 'border.default', color: 'fg.subtle' })
const statusText = css({ minW: '0' })
const statusTitle = css({ textStyle: 'ui.xs', color: 'fg.muted' })
const statusDetail = css({ textStyle: 'ui.xs', color: 'fg.subtle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const srOnly = css({ position: 'absolute', w: '[1px]', h: '[1px]', overflow: 'hidden', clip: '[rect(0 0 0 0)]', whiteSpace: 'nowrap' })
</script>

<template>
  <div :class="root">
    <nav :class="nav" aria-label="Primary">
      <div v-for="(sectionGroup, index) in NAV_SECTIONS" :key="sectionGroup.title" :class="section">
        <p v-if="!collapsed" :class="sectionTitle">{{ sectionGroup.title }}</p>
        <span v-else-if="index > 0" :class="divider" />
        <NuxtLink
          v-for="item in sectionGroup.items"
          :key="item.href"
          :to="item.href"
          :title="collapsed ? item.label : undefined"
          :aria-current="isActive(item) ? 'page' : undefined"
          :class="[link, collapsed ? linkCollapsed : '', isActive(item) ? linkActive : '']"
        >
          <Icon :name="item.icon" :size="15" aria-hidden="true" />
          <span :class="collapsed ? srOnly : ''">{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>
    <div v-if="!collapsed" :class="footer">
      <div :class="status" role="status">
        <Icon name="lucide:audio-lines" :size="16" aria-hidden="true" />
        <div :class="statusText">
          <p :class="statusTitle">Audio output</p>
          <p :class="statusDetail" :title="output ? `${output.name} · ${output.channels} out · ${output.sampleRate / 1000} kHz` : undefined">
            {{ output ? `${output.name} · ${output.channels} out` : 'Opens when you play' }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
