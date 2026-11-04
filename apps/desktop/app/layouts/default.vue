<script setup lang="ts">
import { css } from 'styled-system/css'
import { NuxtPage } from '#components'
import { IconButton } from '~/ui'
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '~/shell/AppSidebar.vue'
import AppToolbar from '~/shell/AppToolbar.vue'
import TransportBar from '~/engine/TransportBar.vue'
import ResizeHandle from '~/shell/ResizeHandle.vue'
import { SIDEBAR_RAIL, SIDEBAR_WIDTH, useSidebar } from '~/shell/sidebar'

const route = useRoute()

// The sidebar never collapses on its own: drag its edge to resize it, or narrower to snap it to
// icons (and back out to open it); ⌘B and the toolbar button toggle it (`shell/sidebar.ts`).
const sidebarState = useSidebar()
const collapsed = sidebarState.collapsed
function onKey(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.code === 'KeyB') {
    event.preventDefault()
    sidebarState.toggle()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const shell = css({ display: 'flex', flexDirection: 'column', h: 'full', minH: '0', bg: 'bg.app', color: 'fg.default', overflow: 'hidden' })
const body = css({ display: 'flex', flex: '1', minH: '0' })
const sidebar = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: '0',
  h: 'full',
  bg: 'bg.panel',
  borderRightWidth: '1px',
  borderColor: 'border.default',
})
const sidebarCollapsed = css({ w: '[52px]' }) // SIDEBAR_RAIL
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
    <TransportBar />
    <div :class="body">
      <aside
        :class="[sidebar, collapsed ? sidebarCollapsed : '']"
        :style="collapsed ? undefined : { width: `${sidebarState.width.value}px` }"
        aria-label="Workspace navigation"
      >
        <ResizeHandle
          :width="collapsed ? SIDEBAR_RAIL : sidebarState.width.value"
          label="Resize the sidebar"
          @resize="sidebarState.resize"
          @reset="sidebarState.resize(SIDEBAR_WIDTH)"
        />
        <div :class="nav"><AppSidebar :collapsed="collapsed" /></div>
        <div :class="[toggle, collapsed ? toggleCollapsed : '']">
          <IconButton
            :icon="collapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'"
            :label="collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'"
            variant="ghost"
            size="sm"
            @click="sidebarState.toggle()"
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
