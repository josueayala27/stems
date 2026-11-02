import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import DataTable from './DataTable.vue'
import type { DataTableColumn } from './types'

interface Item {
  id: string
  title: string
  views: number
}

const rows: Item[] = [
  { id: 'a', title: 'Banana', views: 3 },
  { id: 'b', title: 'apple', views: 10 },
  { id: 'c', title: 'Cherry', views: 1 },
  { id: 'd', title: 'Date', views: 7 },
]
const columns: DataTableColumn<Item>[] = [
  { key: 'title', header: 'Title', sortable: true },
  { key: 'views', header: 'Views', sortable: true, align: 'right', width: '80px' },
]

function titles(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('tbody tr').map((tr) => tr.findAll('td').at(-2)?.text() ?? tr.text())
}

describe('DataTable', () => {
  it('emits the next sort on header click and sorts locally when asked', async () => {
    const wrapper = mount(DataTable<Item>, { props: { rows, columns, rowKey: 'id', sortLocally: true, selectable: true } })
    const th = wrapper.findAll('th')[1]!
    expect(th.attributes('aria-sort')).toBe('none')
    await th.get('button').trigger('click')
    expect(wrapper.emitted('update:sort')?.[0]).toEqual([{ key: 'title', direction: 'asc' }])
    await wrapper.setProps({ sort: { key: 'title', direction: 'asc' } })
    expect(th.attributes('aria-sort')).toBe('ascending')
    expect(titles(wrapper)).toEqual(['apple', 'Banana', 'Cherry', 'Date'])
    await wrapper.setProps({ sort: { key: 'views', direction: 'desc' } })
    expect(titles(wrapper)).toEqual(['apple', 'Date', 'Banana', 'Cherry'])
  })

  it('keeps the parent order when not sorting locally', async () => {
    const wrapper = mount(DataTable<Item>, { props: { rows, columns, rowKey: 'id', sort: { key: 'title', direction: 'asc' }, selectable: true } })
    expect(titles(wrapper)).toEqual(['Banana', 'apple', 'Cherry', 'Date'])
  })

  it('selects a range with shift-click and toggles all from the header', async () => {
    let selected: string[] = []
    const wrapper = mount(DataTable<Item>, {
      props: { rows, columns, rowKey: 'id', selectable: true, selected, 'onUpdate:selected': (v: string[]) => (selected = v) },
    })
    const boxes = () => wrapper.findAll('tbody [role=checkbox]')
    await boxes()[0]!.trigger('click')
    await wrapper.setProps({ selected })
    await boxes()[2]!.trigger('click', { shiftKey: true })
    expect(selected).toEqual(['a', 'b', 'c'])
    await wrapper.setProps({ selected })
    const all = wrapper.get('thead [role=checkbox]')
    expect(all.attributes('aria-checked')).toBe('mixed')
    await all.trigger('click')
    expect(selected).toEqual(['a', 'b', 'c', 'd'])
    expect(wrapper.findAll('tbody tr')[0]!.attributes('aria-selected')).toBe('true')
  })

  it('reports row clicks but not checkbox clicks', async () => {
    const onRowClick = vi.fn()
    const wrapper = mount(DataTable<Item>, { props: { rows, columns, rowKey: 'id', selectable: true, onRowClick } })
    const tr = wrapper.findAll('tbody tr')[1]!
    expect(tr.attributes('tabindex')).toBe('0')
    await tr.trigger('click')
    expect(onRowClick).toHaveBeenCalledWith(rows[1], expect.any(MouseEvent))
    await tr.get('[role=checkbox]').trigger('click')
    await tr.trigger('keydown', { key: 'Enter' })
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })

  it('renders cell slots, and the empty and loading states', async () => {
    const wrapper = mount(DataTable<Item>, {
      props: { rows: [], columns, rowKey: 'id' },
      slots: { 'cell-title': ({ value }: { value: unknown }) => h('b', String(value)), empty: () => 'Nothing here' },
    })
    expect(wrapper.get('tbody').text()).toBe('Nothing here')
    await wrapper.setProps({ loading: true })
    expect(wrapper.get('table').attributes('aria-busy')).toBe('true')
    await wrapper.setProps({ rows, loading: false })
    expect(wrapper.find('tbody b').text()).toBe('Banana')
  })

  it('virtualizes long lists', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}`, views: i }))
    const wrapper = mount(DataTable<Item>, { props: { rows: many, columns, rowKey: 'id' } })
    const rendered = wrapper.findAll('tbody tr[aria-rowindex]')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(60)
    expect(wrapper.get('table').attributes('aria-rowcount')).toBe('1001')
  })
})
