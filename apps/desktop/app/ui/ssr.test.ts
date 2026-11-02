// @vitest-environment node
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import * as kit from './index'

// Every kit component must render on the server: no `document`/`window` during setup or render.
// Generic SFCs (Select, Tabs) are functions in their type, so the table holds `unknown` and narrows at render.
const cases: Array<[string, unknown, Record<string, unknown>, Record<string, () => unknown>?]> = [
  ['Button', kit.Button, {}, { default: () => 'Go' }],
  ['IconButton', kit.IconButton, { icon: 'lucide:plus', label: 'Add', shortcut: 'Mod+N' }],
  ['Tooltip', kit.Tooltip, { content: 'Hi' }, { default: () => h('button', 'x') }],
  ['Popover', kit.Popover, { open: true }, { trigger: () => h('button', 'x'), default: () => 'body' }],
  ['Menu', kit.Menu, { items: [{ id: 'a', label: 'A', shortcut: 'Mod+A' }, { type: 'separator' }] }, { trigger: () => h('button', 'x') }],
  ['ContextMenu', kit.ContextMenu, { items: [{ id: 'a', label: 'A' }] }, { default: () => h('div', 'area') }],
  ['MenuList', kit.MenuList, { items: [{ id: 'a', label: 'A', checked: true }] }],
  ['Select', kit.Select, { options: [{ value: 'a', label: 'A' }], modelValue: 'a' }],
  ['SegmentedControl', kit.SegmentedControl, { options: [{ value: 'a', label: 'A', dot: true }], modelValue: 'a' }],
  ['StatePicker', kit.StatePicker, { overridden: ['hover'] }],
  ['Input', kit.Input, { modelValue: 'x' }],
  ['Textarea', kit.Textarea, { modelValue: 'x' }],
  ['NumberField', kit.NumberField, { modelValue: '12px', label: 'W', units: ['px', '%'] }],
  ['Slider', kit.Slider, { modelValue: 20 }],
  ['Switch', kit.Switch, { modelValue: true }],
  ['Checkbox', kit.Checkbox, { modelValue: true, label: 'Check' }],
  ['ColorField hex', kit.ColorField, { modelValue: '#0099ff80' }],
  ['ColorField token', kit.ColorField, { modelValue: 'var(--brand)' }],
  ['ColorPicker', kit.ColorPicker, { modelValue: '#ff0000' }],
  ['Tabs', kit.Tabs, { modelValue: 'a', tabs: [{ value: 'a', label: 'A' }] }, { a: () => 'panel' }],
  ['Panel', kit.Panel, { title: 'Layers' }, { default: () => 'content' }],
  ['PanelSection', kit.PanelSection, { title: 'Fill', collapsible: true, storageKey: 'ssr.test' }, { default: () => 'rows' }],
  ['PropertyRow', kit.PropertyRow, { label: 'Size' }, { default: () => 'control' }],
  ['FieldGroup', kit.FieldGroup, {}, { default: () => 'x' }],
  ['Divider', kit.Divider, {}],
  ['ScrollArea', kit.ScrollArea, {}, { default: () => 'x' }],
  ['Kbd', kit.Kbd, { shortcut: 'Mod+Shift+K' }],
  ['Swatch', kit.Swatch, { color: '#fff' }],
  ['Dialog', kit.Dialog, { open: true, title: 'T', description: 'D' }, { trigger: () => h('button', 'x'), default: () => 'body', footer: () => h('button', 'ok') }],
  ['DataTable', kit.DataTable, { rows: [{ id: 'a', t: 'A' }], columns: [{ key: 't', header: 'T', sortable: true }], rowKey: 'id', selectable: true, selected: ['a'] }],
  ['DataTable virtual', kit.DataTable, { rows: Array.from({ length: 300 }, (_, i) => ({ id: String(i) })), columns: [{ key: 'id', header: 'Id' }], rowKey: 'id' }],
  ['Combobox', kit.Combobox, { options: [{ value: 'a', label: 'A' }], modelValue: 'a', clearable: true, creatable: true }],
  ['Combobox async', kit.Combobox, { search: async () => [], modelValue: 'x', labelFor: () => 'X' }],
  ['MultiCombobox', kit.MultiCombobox, { options: [{ value: 'a', label: 'A' }], modelValue: ['a', 'b'], clearable: true }],
  ['Sheet', kit.Sheet, { open: true, title: 'T', side: 'left' }, { default: () => 'body', footer: () => h('button', 'ok') }],
  ['Badge', kit.Badge, { tone: 'success', dot: true, label: 'Published' }],
  ['Badge icon', kit.Badge, { tone: 'warning', icon: 'lucide:clock', size: 'md' }, { default: () => 'Scheduled' }],
  ['EmptyState', kit.EmptyState, { icon: 'lucide:inbox', title: 'No items', description: 'Create one' }, { actions: () => h('button', 'New') }],
  ['DateField', kit.DateField, { modelValue: '2026-10-15', min: '2026-01-01' }],
  ['DateField time', kit.DateField, { modelValue: '2026-10-15T09:00:00.000Z', withTime: true }],
  ['FileDrop', kit.FileDrop, { accept: 'image/*', maxSize: 1024 }],
  ['JsonTree', kit.JsonTree, { value: { a: [1, 'x', null], b: { c: true } }, expandDepth: 3, basePath: 'q', rootLabel: 'result' }],
  ['JsonTree long', kit.JsonTree, { value: Array.from({ length: 150 }, (_, i) => i), pageSize: 100 }],
  [
    'SchemaForm',
    kit.SchemaForm,
    {
      schema: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri' },
          body: { type: 'string', 'x-multiline': true },
          method: { type: 'string', enum: ['GET', 'POST'] },
          retries: { type: 'integer', minimum: 0 },
          verbose: { type: 'boolean' },
          token: { type: 'string', 'x-secret': true },
          headers: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
          extra: {},
        },
      },
      modelValue: { url: 'x', headers: [{ name: 'a' }], extra: { a: 1 } },
      storedSecrets: ['token'],
      showErrors: true,
    },
  ],
  ['SortableList', kit.SortableList, { items: [{ id: 'a' }, { id: 'b' }], listId: 'l', itemKey: 'id' }, { default: () => 'row' }],
  ['SortableList empty', kit.SortableList, { items: [], listId: 'e', itemKey: 'id' }],
  ['KeyValueEditor', kit.KeyValueEditor, { modelValue: [{ key: 'a', value: '1' }, { key: 'a', value: '2' }] }],
  ['CodeBlock', kit.CodeBlock, { code: '{\n  "a": 1\n}', language: 'json', lineNumbers: true, maxHeight: '200px' }],
  ['CodeBlock bare', kit.CodeBlock, { code: 'x', wrap: true }],
  ['SplitPane', kit.SplitPane, { panes: [{ id: 'a', min: 100 }, { id: 'b' }], sizes: [30, 70] }, { a: () => 'left', b: () => 'right' }],
  ['SplitPane vertical', kit.SplitPane, { panes: [{ id: 'a' }, { id: 'b' }], direction: 'vertical' }],
  ['TreeItem', kit.TreeItem, { label: 'Hero', depth: 1, expandable: true, editing: true }],
]

describe('SSR', () => {
  it.each(cases)('%s renders without browser globals', async (_name, component, props, slots) => {
    const app = createSSRApp({ setup: () => () => h(component as Component, props, slots) })
    const html = await renderToString(app, {})
    expect(typeof html).toBe('string')
  })

  it('the wave 5 data showcase renders', async () => {
    const { default: KitData } = await import('./showcase/KitData.vue')
    const html = await renderToString(createSSRApp({ setup: () => () => h(KitData) }))
    expect(html).toContain('Post 1')
    expect(html).toContain('No collections yet')
  })

  it('the wave 6 logic showcase renders', async () => {
    const { default: KitLogic } = await import('./showcase/KitLogic.vue')
    const html = await renderToString(createSSRApp({ setup: () => () => h(KitLogic) }))
    expect(html).toContain('Base URL')
    expect(html).toContain('Show toast')
    expect(html).toContain('role="separator"')
  })

  it('motion helpers import and run on the server', async () => {
    const motion = await import('../motion')
    expect(motion.prefersReducedMotion()).toBe(false)
    const app = createSSRApp({ setup: () => () => h(motion.MotionTransition, { preset: 'popover' }, { default: () => h('div', 'x') }) })
    await expect(renderToString(app)).resolves.toContain('x')
  })
})
