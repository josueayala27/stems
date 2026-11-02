<script setup lang="ts">
import { css } from 'styled-system/css'
import { Icon } from '#components'
import { ref } from 'vue'
import { MotionTransition, useFlip } from '../../motion'
import {
  Button,
  Checkbox,
  ColorPicker,
  ContextMenu,
  Divider,
  IconButton,
  Input,
  Kbd,
  Menu,
  NumberField,
  Popover,
  Select,
  Slider,
  Switch,
  Tabs,
  Tooltip,
  type MenuEntry,
} from '../index'

const emit = defineEmits<{ log: [message: string] }>()

const loading = ref(false)
function fakeSave(): void {
  loading.value = true
  setTimeout(() => (loading.value = false), 1200)
}

const search = ref('')
const name = ref('Hero section')
const url = ref('malla.site/home')
const checked = ref(true)
const partial = ref(false)
const enabled = ref(true)
const volume = ref(40)
const popoverOpen = ref(false)
const color = ref('#8b5cf680')
const radius = ref('8px')
const corners = ref<'all' | 'each'>('all')
const cornerOptions = [
  { value: 'all' as const, label: 'All corners' },
  { value: 'each' as const, label: 'Each corner' },
]
const showToast = ref(true)

const moreMenu: MenuEntry[] = [
  { id: 'cut', label: 'Cut', icon: 'lucide:scissors', shortcut: 'Mod+X' },
  { id: 'copy', label: 'Copy', icon: 'lucide:copy', shortcut: 'Mod+C' },
  { id: 'paste', label: 'Paste', icon: 'lucide:clipboard', shortcut: 'Mod+V', disabled: true },
  { type: 'separator' },
  { id: 'grid', label: 'Show grid', checked: true, shortcut: "Mod+'" },
  { id: 'rulers', label: 'Show rulers', checked: false, shortcut: 'Shift+R' },
]

const canvasMenu: MenuEntry[] = [
  { id: 'paste-here', label: 'Paste here', icon: 'lucide:clipboard-paste', shortcut: 'Mod+V' },
  { id: 'select-all', label: 'Select all', icon: 'lucide:box-select', shortcut: 'Mod+A' },
  { type: 'separator' },
  { id: 'zoom-fit', label: 'Zoom to fit', icon: 'lucide:scan', shortcut: 'Shift+1' },
  { id: 'zoom-100', label: 'Zoom to 100%', shortcut: 'Shift+0' },
]

const tab = ref<'buttons' | 'fields'>('buttons')

// Flip demo: shuffle a list and let positions animate.
const items = ref(['Frame', 'Stack', 'Text', 'Image', 'Link', 'Grid'])
const list = ref<HTMLElement | null>(null)
const { animate } = useFlip({ duration: 'slow', ease: 'emphasized' })
function shuffle(): void {
  void animate('[data-flip]', () => {
    items.value = [...items.value].sort(() => Math.random() - 0.5)
  }, { scope: list.value })
}

const grid = css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(token(sizes.72), 1fr))', gap: '4', flex: '1', minW: '0' })
const card = css({ display: 'flex', flexDirection: 'column', gap: '3', p: '4', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md' })
const cardTitle = css({ textStyle: 'ui.label', color: 'fg.muted' })
const row = css({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2' })
const stack = css({ display: 'flex', flexDirection: 'column', gap: '2' })
const hint = css({ textStyle: 'ui.xs', color: 'fg.subtle' })
const area = css({
  display: 'grid',
  placeItems: 'center',
  h: '28',
  borderRadius: 'sm',
  borderWidth: '1px',
  borderStyle: 'dashed',
  borderColor: 'border.strong',
  bg: 'bg.canvas',
  color: 'fg.subtle',
  textStyle: 'ui.sm',
})
const chips = css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' })
const chip = css({ px: '2', h: 'control.sm', display: 'inline-flex', alignItems: 'center', borderRadius: 'xs', bg: 'bg.subtle', textStyle: 'ui.xs' })
const toast = css({ display: 'flex', alignItems: 'center', gap: '2', p: '2', pl: '3', borderRadius: 'md', bg: 'bg.elevated', boxShadow: 'popover', textStyle: 'ui.sm' })
const popoverBody = css({ display: 'flex', flexDirection: 'column', gap: '2', w: '56' })
const fieldW = css({ w: '24' })
const padTop = css({ pt: '3' })
</script>

<template>
  <div :class="grid">
    <section :class="card">
      <h3 :class="cardTitle">Buttons</h3>
      <div :class="row">
        <Button variant="primary">Publish</Button>
        <Button>Secondary</Button>
        <Button variant="ghost" icon="lucide:plus">Ghost</Button>
        <Button variant="danger" icon="lucide:trash-2">Delete</Button>
      </div>
      <div :class="row">
        <Button size="sm" variant="primary">Small</Button>
        <Button size="sm">Small</Button>
        <Button :loading="loading" icon="lucide:save" @click="fakeSave">Save</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div :class="row">
        <IconButton icon="lucide:undo-2" label="Undo" shortcut="Mod+Z" />
        <IconButton icon="lucide:redo-2" label="Redo" shortcut="Mod+Shift+Z" />
        <Divider orientation="vertical" />
        <IconButton icon="lucide:bold" label="Bold" shortcut="Mod+B" :active="checked" @click="checked = !checked" />
        <IconButton icon="lucide:italic" label="Italic" shortcut="Mod+I" :active="false" />
        <IconButton icon="lucide:settings-2" label="Settings" variant="subtle" />
        <IconButton icon="lucide:lock" label="Locked" disabled />
      </div>
    </section>

    <section :class="card">
      <h3 :class="cardTitle">Text inputs</h3>
      <div :class="stack">
        <Input v-model="search" placeholder="Search layers…" live>
          <template #prefix><Icon name="lucide:search" :size="14" /></template>
          <template #suffix><Kbd shortcut="Mod+K" tone="subtle" /></template>
        </Input>
        <Input v-model="name" @commit="(v) => emit('log', `name = ${v}`)" />
        <Input v-model="url" size="sm">
          <template #prefix>https://</template>
        </Input>
        <Input model-value="not-a-url" invalid />
      </div>
      <p :class="hint">Enter or blur commits, Esc reverts.</p>
    </section>

    <section :class="card">
      <h3 :class="cardTitle">Number fields</h3>
      <div :class="row">
        <div :class="fieldW"><NumberField v-model="radius" icon="lucide:square-round-corner" :min="0" /></div>
        <div :class="fieldW"><NumberField model-value="50%" label="W" :units="['px', '%', 'auto']" /></div>
        <div :class="fieldW"><NumberField model-value="auto" label="H" :units="['px', 'auto']" /></div>
        <div :class="fieldW"><NumberField model-value="" label="X" mixed /></div>
      </div>
      <p :class="hint">Drag a label to scrub (Shift ×10, Alt ×0.1). Arrows ±1, Shift ±10. Type "12px", "50%", "auto" or "10*4".</p>
    </section>

    <section :class="card">
      <h3 :class="cardTitle">Toggles</h3>
      <div :class="stack">
        <Checkbox v-model="checked" label="Clip content" />
        <Checkbox v-model="partial" indeterminate label="Some children visible" />
        <Checkbox :model-value="false" label="Disabled" disabled />
        <div :class="row">
          <Switch v-model="enabled" aria-label="Enabled" />
          <Switch v-model="enabled" size="sm" aria-label="Enabled small" />
          <Switch :model-value="false" disabled aria-label="Disabled" />
        </div>
        <Slider v-model="volume" aria-label="Demo slider" @scrub-start="emit('log', 'slider start')" @scrub-end="emit('log', `slider end ${volume}`)" />
      </div>
    </section>

    <section :class="card">
      <h3 :class="cardTitle">Overlays</h3>
      <div :class="row">
        <Tooltip content="Duplicate" shortcut="Mod+D">
          <Button size="sm">Hover me</Button>
        </Tooltip>
        <Popover v-model:open="popoverOpen" placement="bottom-start" padding="md" aria-label="Corner radius">
          <template #trigger="{ props }">
            <Button size="sm" icon="lucide:square-round-corner" v-bind="props">Popover</Button>
          </template>
          <div :class="popoverBody">
            <span :class="cardTitle">Corner radius</span>
            <NumberField v-model="radius" icon="lucide:square-round-corner" :min="0" />
            <!-- A select inside the popover: nested floating layers. -->
            <Select v-model="corners" :options="cornerOptions" size="sm" aria-label="Corners" />
            <Button size="sm" variant="primary" @click="popoverOpen = false">Done</Button>
          </div>
        </Popover>
        <Menu :items="moreMenu" @select="(id) => emit('log', `menu → ${id}`)">
          <template #trigger="{ props }">
            <IconButton icon="lucide:ellipsis" label="More" v-bind="props" />
          </template>
        </Menu>
      </div>
      <ContextMenu :items="canvasMenu" @select="(id) => emit('log', `canvas → ${id}`)">
        <div :class="area">Right-click anywhere here</div>
      </ContextMenu>
    </section>

    <section :class="card">
      <h3 :class="cardTitle">Color picker</h3>
      <ColorPicker v-model="color" @scrub-start="emit('log', 'picker start')" @scrub-end="emit('log', `picker end ${color}`)" />
    </section>

    <section :class="card">
      <h3 :class="cardTitle">Tabs</h3>
      <Tabs
        v-model="tab"
        :tabs="[
          { value: 'buttons', label: 'Buttons', icon: 'lucide:mouse-pointer-click' },
          { value: 'fields', label: 'Fields', icon: 'lucide:text-cursor-input' },
        ]"
        aria-label="Demo tabs"
      >
        <template #buttons>
          <div :class="[row, padTop]"><Button size="sm">One</Button><Button size="sm">Two</Button></div>
        </template>
        <template #fields>
          <div :class="padTop"><Input model-value="Panel content" /></div>
        </template>
      </Tabs>
    </section>

    <section :class="card">
      <h3 :class="cardTitle">Motion</h3>
      <div :class="row">
        <Button size="sm" icon="lucide:shuffle" @click="shuffle">Flip shuffle</Button>
        <Button size="sm" @click="showToast = !showToast">Toggle slideUp</Button>
      </div>
      <div ref="list" :class="chips">
        <span v-for="item in items" :key="item" data-flip :class="chip">{{ item }}</span>
      </div>
      <MotionTransition preset="slideUp">
        <div v-if="showToast" :class="toast">
          <Icon name="lucide:check-circle-2" :size="16" />
          <span>Published to malla.site</span>
          <IconButton icon="lucide:x" label="Dismiss" size="sm" @click="showToast = false" />
        </div>
      </MotionTransition>
      <p :class="hint">Keyboard: <Kbd shortcut="Mod+Shift+P" /> <Kbd shortcut="Alt+Enter" /></p>
    </section>
  </div>
</template>
