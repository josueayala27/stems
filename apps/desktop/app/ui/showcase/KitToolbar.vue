<script setup lang="ts">
import { css } from 'styled-system/css'
import { ref } from 'vue'
import { Button, Divider, IconButton, Menu, Select, SegmentedControl, type MenuEntry, type SelectOption } from '../index'

const emit = defineEmits<{ log: [message: string] }>()

const tool = ref('select')
const tools = [
  { id: 'select', icon: 'lucide:mouse-pointer-2', label: 'Select', shortcut: 'V' },
  { id: 'frame', icon: 'lucide:frame', label: 'Frame', shortcut: 'F' },
  { id: 'text', icon: 'lucide:type', label: 'Text', shortcut: 'T' },
  { id: 'image', icon: 'lucide:image', label: 'Image', shortcut: 'I' },
  { id: 'hand', icon: 'lucide:hand', label: 'Hand', shortcut: 'H' },
]

const breakpoint = ref('desktop')
const breakpoints = [
  { value: 'desktop', icon: 'lucide:monitor', title: 'Desktop' },
  { value: 'tablet', icon: 'lucide:tablet', title: 'Tablet' },
  { value: 'mobile', icon: 'lucide:smartphone', title: 'Mobile' },
]

const zoom = ref('100')
const zoomOptions: SelectOption[] = [
  { value: '50', label: '50%' },
  { value: '100', label: '100%' },
  { value: '200', label: '200%' },
  { value: 'fit', label: 'Zoom to fit', icon: 'lucide:scan' },
]

const pageMenu: MenuEntry[] = [
  { type: 'label', label: 'Pages' },
  { id: 'home', label: 'Home', icon: 'lucide:file', checked: true },
  { id: 'about', label: 'About', icon: 'lucide:file', checked: false },
  { type: 'separator' },
  { id: 'new', label: 'New page', icon: 'lucide:plus', shortcut: 'Mod+Alt+N' },
  { id: 'dup', label: 'Duplicate page', icon: 'lucide:copy', shortcut: 'Mod+D' },
  { id: 'delete', label: 'Delete page', icon: 'lucide:trash-2', danger: true, shortcut: 'Backspace' },
]

const bar = css({
  display: 'flex',
  alignItems: 'center',
  gap: '1',
  h: 'toolbar',
  px: '2',
  bg: 'bg.panel',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
})
const group = css({ display: 'flex', alignItems: 'center', gap: '0.5' })
const spacer = css({ flex: '1' })
const zoomBox = css({ w: '28' })
</script>

<template>
  <div :class="bar" role="toolbar" aria-label="Editor toolbar">
    <div :class="group">
      <IconButton
        v-for="t in tools"
        :key="t.id"
        :icon="t.icon"
        :label="t.label"
        :shortcut="t.shortcut"
        size="lg"
        :active="tool === t.id"
        @click="tool = t.id"
      />
    </div>
    <Divider orientation="vertical" />
    <Menu :items="pageMenu" aria-label="Page" @select="(id) => emit('log', `menu → ${id}`)">
      <template #trigger="{ props }">
        <Button variant="ghost" icon-end="lucide:chevron-down" v-bind="props">Home</Button>
      </template>
    </Menu>
    <div :class="spacer" />
    <SegmentedControl v-model="breakpoint" :options="breakpoints" :fill="false" aria-label="Breakpoint" />
    <div :class="spacer" />
    <div :class="zoomBox"><Select v-model="zoom" :options="zoomOptions" aria-label="Zoom" /></div>
    <IconButton icon="lucide:play" label="Preview" shortcut="Mod+P" size="lg" />
    <Button variant="secondary" icon="lucide:share">Share</Button>
    <Button variant="primary" @click="emit('log', 'publish')">Publish</Button>
  </div>
</template>
