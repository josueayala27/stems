import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Component, type PropType, type VNode, type VNodeChild } from 'vue'
import { applyMove, slotToMove, type SortableMove } from './lib/sortable'
import SortableList from './SortableList.vue'

describe('slotToMove / applyMove', () => {
  it('maps slots to final indexes and skips no-ops', () => {
    const from = { listId: 'a', index: 1 }
    expect(slotToMove(from, { listId: 'a', index: 1 })).toBeNull()
    expect(slotToMove(from, { listId: 'a', index: 2 })).toBeNull()
    expect(slotToMove(from, { listId: 'a', index: 3 })).toEqual({ from, to: { listId: 'a', index: 2 } })
    expect(slotToMove(from, { listId: 'a', index: 0 })).toEqual({ from, to: { listId: 'a', index: 0 } })
    expect(slotToMove(from, { listId: 'b', index: 0 })).toEqual({ from, to: { listId: 'b', index: 0 } })
  })

  it('applies moves within and across lists', () => {
    expect(applyMove({ a: [1, 2, 3] }, { from: { listId: 'a', index: 0 }, to: { listId: 'a', index: 2 } })).toEqual({ a: [2, 3, 1] })
    expect(applyMove({ a: [1, 2], b: [9] }, { from: { listId: 'a', index: 1 }, to: { listId: 'b', index: 0 } })).toEqual({ a: [1], b: [2, 9] })
  })
})

interface Step {
  id: string
  children?: Step[]
}

// A two-level step tree: the "if" step holds a nested list of the same group.
const Tree: Component = defineComponent({
  name: 'Tree',
  props: { steps: { type: Array as PropType<Step[]>, required: true }, listId: { type: String, required: true } },
  emits: ['move'],
  setup(props, { emit }): () => VNode {
    return () =>
      h(
        SortableList<Step>,
        { items: props.steps, listId: props.listId, itemKey: 'id', group: 'steps', itemLabel: (s: Step) => s.id, ariaLabel: props.listId, onMove: (m: SortableMove) => emit('move', m) },
        {
          default: ({ item }: { item: Step }): VNodeChild[] => [
            h('span', item.id),
            item.children ? h(Tree, { steps: item.children, listId: `${item.id}.children`, onMove: (m: SortableMove) => emit('move', m) }) : null,
          ],
        },
      )
  },
})

function mountTree() {
  const steps = ref<Step[]>([{ id: 'a' }, { id: 'if', children: [{ id: 'b' }] }, { id: 'c' }])
  const moves: SortableMove[] = []
  const wrapper = mount(
    defineComponent({ setup: () => () => h(Tree, { steps: steps.value, listId: 'root', onMove: (m: SortableMove) => moves.push(m) }) }),
    { attachTo: document.body },
  )
  const handle = (id: string) => wrapper.get(`[data-sortable-key="${id}"] > [data-sortable-handle]`)
  return { wrapper, moves, handle }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('SortableList', () => {
  it('renders handles with accessible names and an empty drop zone', () => {
    const wrapper = mount(SortableList<{ id: string }>, { props: { items: [], listId: 'x', itemKey: 'id' }, attachTo: document.body })
    expect(wrapper.get('[data-part=empty]').text()).toBe('Drop items here')
    wrapper.unmount()
    const { wrapper: tree, handle } = mountTree()
    expect(handle('a').attributes('aria-label')).toBe('Reorder a')
    tree.unmount()
  })

  it('moves one step with Alt+Arrow', async () => {
    const { wrapper, moves, handle } = mountTree()
    await handle('a').trigger('keydown', { key: 'ArrowDown', altKey: true })
    await vi.waitFor(() => expect(moves).toEqual([{ from: { listId: 'root', index: 0 }, to: { listId: 'root', index: 1 } }]))
    await handle('a').trigger('keydown', { key: 'ArrowUp', altKey: true })
    expect(moves).toHaveLength(1)
    wrapper.unmount()
  })

  it('grabs with Space, walks into a nested list and drops there', async () => {
    const { wrapper, moves, handle } = mountTree()
    const a = handle('a')
    await a.trigger('keydown', { key: ' ' })
    expect(a.attributes('aria-pressed')).toBe('true')
    await a.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('[data-sortable-list="if.children"] [data-part=indicator]').exists()).toBe(true)
    await a.trigger('keydown', { key: ' ' })
    await vi.waitFor(() => expect(moves).toEqual([{ from: { listId: 'root', index: 0 }, to: { listId: 'if.children', index: 0 } }]))
    wrapper.unmount()
  })

  it('cancels a keyboard grab with Escape', async () => {
    const { wrapper, moves, handle } = mountTree()
    const c = handle('c')
    await c.trigger('keydown', { key: ' ' })
    await c.trigger('keydown', { key: 'ArrowUp' })
    await c.trigger('keydown', { key: 'Escape' })
    expect(c.attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('[data-part=indicator]').exists()).toBe(false)
    expect(moves).toEqual([])
    wrapper.unmount()
  })

  it('never offers slots inside the dragged item', async () => {
    const { wrapper, moves, handle } = mountTree()
    const step = handle('if')
    await step.trigger('keydown', { key: ' ' })
    await step.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('[data-sortable-list="if.children"] [data-part=indicator]').exists()).toBe(false)
    await step.trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(moves).toEqual([{ from: { listId: 'root', index: 1 }, to: { listId: 'root', index: 2 } }]))
    wrapper.unmount()
  })

  it('drags with the pointer to the slot under the cursor', async () => {
    const { wrapper, moves, handle } = mountTree()
    const items = wrapper.findAll('[data-sortable-list=root] > [data-sortable-item]')
    items.forEach((item, i) => {
      vi.spyOn(item.element, 'getBoundingClientRect').mockReturnValue({ top: i * 40, height: 40, bottom: i * 40 + 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON: () => ({}) })
    })
    document.elementFromPoint = () => items[2]!.element
    const a = handle('a')
    await a.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    await a.trigger('pointermove', { pointerId: 1, clientX: 5, clientY: 110 })
    expect(wrapper.findAll('[data-sortable-list=root] > [data-part=indicator]')).toHaveLength(1)
    await a.trigger('pointerup', { pointerId: 1, clientX: 5, clientY: 110 })
    await vi.waitFor(() => expect(moves).toEqual([{ from: { listId: 'root', index: 0 }, to: { listId: 'root', index: 2 } }]))
    wrapper.unmount()
  })
})
