<script setup lang="ts">
import { css } from 'styled-system/css'
import { NuxtPage } from '#components'
import { IconButton } from '~/ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '~/shell/AppSidebar.vue'
import AppToolbar from '~/shell/AppToolbar.vue'

const route = useRoute()

// Collapse to an icon rail on narrow windows; a manual toggle overrides until the next resize.
const NARROW = '(max-width: 900px)'
const collapsed = ref(false)
let query: MediaQueryList | undefined
function onQuery(event: MediaQueryListEvent): void {
  collapsed.value = event.matches
}
onMounted(() => {
  query = window.matchMedia(NARROW)
  collapsed.value = query.matches
  query.addEventListener('change', onQuery)
})
onBeforeUnmount(() => query?.removeEventListener('change', onQuery))

const shell = css({ display: 'flex', flexDirection: 'column', h: 'full', minH: '0', bg: 'bg.app', color: 'fg.default', overflow: 'hidden' })
const body = css({ display: 'flex', flex: '1', minH: '0' })
const sidebar = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  w: 'sidebar',
  flexShrink: '0',
  h: 'full',
  bg: 'bg.panel',
  borderRightWidth: '1px',
  borderColor: 'border.default',
})
const sidebarCollapsed = css({ w: '[52px]' })
const nav = css({ flex: '1', minH: '0' })
const toggle = css({ flexShrink: '0', display: 'flex', p: '2', borderTopWidth: '1px', borderColor: 'border.default' })
const toggleCollapsed = css({ justifyContent: 'center' })
const main = css({ flex: '1', minW: '0', h: 'full', minH: '0', overflow: 'hidden', outline: 'none' })
const page = css({ h: 'full', minH: '0', '@media (prefers-reduced-motion: no-preference)': { animation: '[stems-page-in 140ms ease-out]' } })
const skip = css({
  position: 'absolute',
  left: '2',
  top: '2',
  zIndex: '[100]',
  px: '3',
  py: '1.5',
  borderRadius: 'sm',
  bg: 'bg.panel',
  color: 'fg.default',
  textStyle: 'ui.sm',
  transform: 'translateY(-200%)',
  _focus: { transform: 'none' },
})
</script>

<template>
  <div :class="shell">
    <a href="#main" :class="skip">Skip to content</a>
    <AppToolbar />
    <div :class="body">
      <aside :class="[sidebar, collapsed ? sidebarCollapsed : '']" aria-label="Workspace navigation">
        <div :class="nav"><AppSidebar :collapsed="collapsed" /></div>
        <div :class="[toggle, collapsed ? toggleCollapsed : '']">
          <IconButton
            :icon="collapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'"
            :label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            variant="ghost"
            size="sm"
            @click="collapsed = !collapsed"
          />
        </div>
      </aside>
      <main id="main" tabindex="-1" :class="main">
        <div :key="route.path" :class="page"><slot><NuxtPage /></slot></div>
      </main>
    </div>
  </div>
</template>

<style>
@keyframes stems-page-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
