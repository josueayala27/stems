import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { normalizeSizes, resizePanes } from './lib/splitPane'
import SplitPane from './SplitPane.vue'
import type { SplitPaneItem } from './types'

// jsdom has no layout: a pane measures its flex-grow share of 1000px.
const SPACE = 1000
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const size = this.dataset.part === 'pane' ? (Number(this.style.flexGrow) / 100) * SPACE : 0
    return { width: size, height: size, top: 0, left: 0, right: size, bottom: size, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const panes: SplitPaneItem[] = [
  { id: 'scope', min: 200, max: 400, label: 'scope' },
  { id: 'editor', min: 300 },
]

// Controlled like `v-model:sizes`: every update is written back as the prop.
function mountSplit(props: Record<string, unknown> = {}): VueWrapper {
  const wrapper: VueWrapper = mount(SplitPane, {
    props: { panes, sizes: [30, 70], 'onUpdate:sizes': (sizes: number[] | undefined): void => void wrapper.setProps({ sizes }), ...props },
    slots: { scope: ({ size }: { size: number }) => h('span', `scope ${size}`), editor: () => h('span', 'editor') },
    attachTo: document.body,
  })
  return wrapper
}

function lastSizes(wrapper: ReturnType<typeof mountSplit>): number[] | undefined {
  return wrapper.emitted<[number[]]>('update:sizes')?.at(-1)?.[0]
}

describe('splitPane math', () => {
  it('normalizes sizes to 100 with an equal fallback', () => {
    expect(normalizeSizes(undefined, 4)).toEqual([25, 25, 25, 25])
    expect(normalizeSizes([1, 3], 2)).toEqual([25, 75])
    expect(normalizeSizes([50, Number.NaN, -1], 3)).toEqual([42.857, 28.571, 28.571])
  })

  it('clamps to both panes of the pair', () => {
    const limits = [{ min: 100 }, { min: 200, max: 500 }]
    expect(resizePanes([300, 700], limits, 0, 50)).toEqual([50, 50]) // after.max 500 keeps before ≥ 500
    expect(resizePanes([500, 500], limits, 0, 900)).toEqual([80, 20]) // after.min 200
    expect(resizePanes([500, 500], limits, 0, 600)).toEqual([60, 40])
  })
})

describe('SplitPane', () => {
  it('renders panes with percentage flex and separator ARIA', async () => {
    const wrapper = mountSplit()
    await nextTick() // limits are known once the panes are measured on mount
    const [scope, editor] = wrapper.findAll('[data-part=pane]')
    expect(scope!.attributes('style')).toContain('flex-grow: 30')
    expect(scope!.attributes('style')).toContain('min-width: 200px')
    expect(editor!.attributes('style')).toContain('flex-grow: 70')
    expect(scope!.text()).toBe('scope 30')
    const separator = wrapper.get('[role=separator]')
    expect(separator.attributes()).toMatchObject({
      tabindex: '0',
      'aria-orientation': 'vertical',
      'aria-valuenow': '30',
      'aria-valuemin': '20',
      'aria-valuemax': '40',
      'aria-controls': scope!.attributes('id'),
      'aria-label': 'Resize scope',
    })
    wrapper.unmount()
  })

  it('resizes with arrow keys, 8px and 32px with Shift', async () => {
    const wrapper = mountSplit()
    const separator = wrapper.get('[role=separator]')
    await separator.trigger('keydown', { key: 'ArrowRight' })
    expect(lastSizes(wrapper)).toEqual([30.8, 69.2])
    await separator.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(lastSizes(wrapper)).toEqual([27.6, 72.4])
    expect(wrapper.emitted('resize-end')).toHaveLength(2)
    // Vertical arrows do nothing on a horizontal split.
    await separator.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:sizes')).toHaveLength(2)
    wrapper.unmount()
  })

  it('jumps to the limits with Home and End and clamps arrows there', async () => {
    const wrapper = mountSplit()
    const separator = wrapper.get('[role=separator]')
    await separator.trigger('keydown', { key: 'Home' })
    expect(lastSizes(wrapper)).toEqual([20, 80])
    await separator.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:sizes')).toHaveLength(1) // already at min: no update
    await separator.trigger('keydown', { key: 'End' })
    expect(lastSizes(wrapper)).toEqual([40, 60])
    await separator.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(wrapper.emitted('update:sizes')).toHaveLength(2)
    expect(separator.attributes('aria-valuenow')).toBe('40')
    wrapper.unmount()
  })

  it('stacks vertically and uses up and down arrows', async () => {
    const wrapper = mountSplit({ direction: 'vertical', panes: [{ id: 'scope' }, { id: 'editor' }], sizes: [50, 50] })
    const separator = wrapper.get('[role=separator]')
    expect(separator.attributes('aria-orientation')).toBe('horizontal')
    expect(wrapper.get('[data-part=pane]').attributes('style')).not.toContain('min-width')
    await separator.trigger('keydown', { key: 'ArrowUp' })
    expect(lastSizes(wrapper)).toEqual([49.2, 50.8])
    await separator.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:sizes')).toHaveLength(1)
    wrapper.unmount()
  })

  it('drags the separator with the pointer, clamped', async () => {
    const wrapper = mountSplit()
    const separator = wrapper.get('[role=separator]')
    await separator.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 300 })
    expect(document.activeElement).toBe(separator.element)
    await separator.trigger('pointermove', { pointerId: 1, clientX: 350 })
    expect(lastSizes(wrapper)).toEqual([35, 65])
    await separator.trigger('pointermove', { pointerId: 1, clientX: 900 })
    expect(lastSizes(wrapper)).toEqual([40, 60])
    await separator.trigger('pointerup', { pointerId: 1 })
    expect(wrapper.emitted<[number[]]>('resize-end')?.[0]?.[0]).toEqual([40, 60])
    await separator.trigger('pointermove', { pointerId: 1, clientX: 100 })
    expect(lastSizes(wrapper)).toEqual([40, 60]) // drag over
    wrapper.unmount()
  })

  it('splits evenly without sizes and keeps a local model', async () => {
    const wrapper = mount(SplitPane, { props: { panes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, attachTo: document.body })
    const panesEls = wrapper.findAll('[data-part=pane]')
    expect(panesEls.map((p) => p.attributes('style'))).toEqual(Array(3).fill('flex-grow: 33.333;'))
    const [first, second] = wrapper.findAll('[role=separator]')
    await second!.trigger('keydown', { key: 'Home' })
    expect(wrapper.findAll('[data-part=pane]').map((p) => p.attributes('style'))).toEqual([
      'flex-grow: 33.333;',
      'flex-grow: 0;',
      'flex-grow: 66.667;',
    ])
    expect(first!.attributes('aria-valuenow')).toBe('33')
    wrapper.unmount()
  })
})
