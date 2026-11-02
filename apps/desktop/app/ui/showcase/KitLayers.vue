<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed, reactive, ref } from 'vue'
import { ContextMenu, IconButton, Panel, TreeItem, type MenuEntry } from '../index'

const emit = defineEmits<{ log: [message: string] }>()

interface Layer {
  id: string
  name: string
  icon: string
  depth: number
  parent: string | null
  hidden?: boolean
  children?: boolean
}

const layers = reactive<Layer[]>([
  { id: 'page', name: 'Home', icon: 'lucide:app-window', depth: 0, parent: null, children: true },
  { id: 'nav', name: 'Navigation', icon: 'lucide:rows-3', depth: 1, parent: 'page', children: true },
  { id: 'logo', name: 'Logo', icon: 'lucide:image', depth: 2, parent: 'nav' },
  { id: 'links', name: 'Links', icon: 'lucide:link', depth: 2, parent: 'nav' },
  { id: 'hero', name: 'Hero', icon: 'lucide:frame', depth: 1, parent: 'page', children: true },
  { id: 'title', name: 'Build faster', icon: 'lucide:type', depth: 2, parent: 'hero' },
  { id: 'cta', name: 'Get started', icon: 'lucide:square-mouse-pointer', depth: 2, parent: 'hero' },
  { id: 'features', name: 'Features', icon: 'lucide:layout-grid', depth: 1, parent: 'page', hidden: true },
  { id: 'footer', name: 'Footer', icon: 'lucide:panel-bottom', depth: 1, parent: 'page' },
])

const expanded = reactive<Record<string, boolean>>({ page: true, nav: false, hero: true })
const selected = ref('hero')
const editing = ref<string | null>(null)
const focused = ref('hero')

const visible = computed(() =>
  layers.filter((layer) => {
    let parent = layer.parent
    while (parent) {
      if (!expanded[parent]) return false
      parent = layers.find((l) => l.id === parent)?.parent ?? null
    }
    return true
  }),
)

function onKeydown(event: KeyboardEvent): void {
  const index = visible.value.findIndex((l) => l.id === focused.value)
  const move = (to: number) => {
    const target = visible.value[to]
    if (!target) return
    focused.value = target.id
    selected.value = target.id
    document.getElementById(`layer-${target.id}`)?.focus()
  }
  const current = visible.value[index]
  if (event.key === 'ArrowDown') move(index + 1)
  else if (event.key === 'ArrowUp') move(index - 1)
  else if (event.key === 'ArrowRight' && current?.children) expanded[current.id] = true
  else if (event.key === 'ArrowLeft' && current?.children) expanded[current.id] = false
  else if (event.key === 'Enter' && current) editing.value = current.id
  else return
  event.preventDefault()
}

const contextItems: MenuEntry[] = [
  { id: 'rename', label: 'Rename', icon: 'lucide:pencil', shortcut: 'Enter' },
  { id: 'duplicate', label: 'Duplicate', icon: 'lucide:copy', shortcut: 'Mod+D' },
  { id: 'wrap', label: 'Wrap in stack', icon: 'lucide:group', shortcut: 'Mod+Alt+G' },
  { type: 'separator' },
  { id: 'hide', label: 'Hide', icon: 'lucide:eye-off', shortcut: 'Mod+Shift+H' },
  { id: 'lock', label: 'Lock', icon: 'lucide:lock', disabled: true },
  { type: 'separator' },
  { id: 'delete', label: 'Delete', icon: 'lucide:trash-2', danger: true, shortcut: 'Backspace' },
]

function onContext(id: string): void {
  emit('log', `context → ${id} (${selected.value})`)
  const layer = layers.find((l) => l.id === selected.value)
  if (!layer) return
  if (id === 'rename') editing.value = layer.id
  if (id === 'hide') layer.hidden = !layer.hidden
}

function rename(layer: Layer, value: string): void {
  layer.name = value
  editing.value = null
  emit('log', `rename → ${value}`)
}

const panel = css({ w: 'sidebar', h: '[420px]', flexShrink: 0 })
const tree = css({ display: 'flex', flexDirection: 'column', gap: '[1px]', p: '1.5' })
</script>

<template>
  <Panel title="Layers" :class="panel" bordered="all">
    <template #actions>
      <IconButton icon="lucide:plus" label="Add layer" size="sm" shortcut="A" />
    </template>
    <ContextMenu :items="contextItems" aria-label="Layer actions" @select="onContext">
      <div role="tree" aria-label="Layers" :class="tree" @keydown="onKeydown">
        <TreeItem
          v-for="layer in visible"
          :id="`layer-${layer.id}`"
          :key="layer.id"
          v-model:expanded="expanded[layer.id]"
          :label="layer.name"
          :icon="layer.icon"
          :depth="layer.depth"
          :expandable="layer.children"
          :selected="selected === layer.id"
          :dimmed="layer.hidden"
          :editing="editing === layer.id"
          :drop-indicator="layer.id === 'footer' ? 'before' : null"
          :tabindex="focused === layer.id ? 0 : -1"
          draggable
          @select="selected = layer.id; focused = layer.id"
          @contextmenu="selected = layer.id"
          @rename-request="editing = layer.id"
          @rename="(v) => rename(layer, v)"
          @rename-cancel="editing = null"
        >
          <template #actions>
            <IconButton :icon="layer.hidden ? 'lucide:eye-off' : 'lucide:eye'" :label="layer.hidden ? 'Show' : 'Hide'" size="sm" :tooltip="false" @click="layer.hidden = !layer.hidden" />
            <IconButton icon="lucide:lock-open" label="Lock" size="sm" :tooltip="false" />
          </template>
        </TreeItem>
      </div>
    </ContextMenu>
  </Panel>
</template>
