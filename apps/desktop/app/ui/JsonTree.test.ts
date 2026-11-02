import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JsonTree from './JsonTree.vue'

const value = { user: { name: 'Ada', roles: ['admin', 'dev'] }, count: 2 }

function tree(props: Record<string, unknown> = {}) {
  return mount(JsonTree, { props: { value, ...props }, attachTo: document.body })
}

function ids(wrapper: ReturnType<typeof tree>): string[] {
  return wrapper.findAll('[role=treeitem]').map((row) => row.attributes('data-path') ?? 'more')
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('JsonTree', () => {
  it('opens the root by default and exposes tree ARIA', () => {
    const wrapper = tree()
    expect(wrapper.find('[role=tree]').exists()).toBe(true)
    expect(ids(wrapper)).toEqual(['', 'user', 'count'])
    const user = wrapper.get('[data-path=user]')
    expect(user.attributes()).toMatchObject({ 'aria-level': '2', 'aria-expanded': 'false', 'aria-posinset': '1', 'aria-setsize': '2' })
    wrapper.unmount()
  })

  it('navigates and toggles with the keyboard', async () => {
    const wrapper = tree()
    const root = wrapper.get('[role=tree]')
    await root.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('data-path')).toBe('user')
    await root.trigger('keydown', { key: 'ArrowRight' })
    expect(ids(wrapper)).toEqual(['', 'user', 'user.name', 'user.roles', 'count'])
    await root.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('data-path')).toBe('user.name')
    await root.trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement?.getAttribute('data-path')).toBe('user')
    await root.trigger('keydown', { key: 'ArrowLeft' })
    expect(ids(wrapper)).toEqual(['', 'user', 'count'])
    wrapper.unmount()
  })

  it('expands and collapses everything', async () => {
    const wrapper = tree()
    await wrapper.get('button[aria-label="Expand all"]').trigger('click')
    expect(ids(wrapper)).toEqual(['', 'user', 'user.name', 'user.roles', 'user.roles[0]', 'user.roles[1]', 'count'])
    await wrapper.get('button[aria-label="Collapse all"]').trigger('click')
    expect(ids(wrapper)).toEqual([''])
    wrapper.unmount()
  })

  it('copies the path with the base prefix', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wrapper = tree({ basePath: 'query.result', expandDepth: 3 })
    await wrapper.get('[data-path="user.roles[1]"] button[aria-label="Copy path"]').trigger('click')
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('query.result.user.roles[1]'))
    await wrapper.get('[data-path="user.roles[1]"] button[aria-label="Copy value"]').trigger('click')
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('dev'))
    expect(wrapper.emitted('copy')?.[0]).toEqual([{ kind: 'path', text: 'query.result.user.roles[1]', path: 'query.result.user.roles[1]' }])
    wrapper.unmount()
  })

  it('windows long arrays behind "show more"', async () => {
    const wrapper = mount(JsonTree, { props: { value: Array.from({ length: 120 }, (_, i) => i), pageSize: 50 }, attachTo: document.body })
    expect(wrapper.findAll('[role=treeitem]')).toHaveLength(52)
    const more = wrapper.findAll('[role=treeitem]').at(-1)!
    expect(more.text()).toContain('Show 50 more (70 hidden)')
    await more.trigger('click')
    expect(wrapper.findAll('[role=treeitem]')).toHaveLength(102)
    wrapper.unmount()
  })

  it('highlights marked paths and opens their ancestors', async () => {
    const wrapper = tree({ basePath: 'item', marked: ['item.user.roles[1]', 'count', 'item.nope.x', 'bad..path'] })
    expect(ids(wrapper)).toEqual(['', 'user', 'user.name', 'user.roles', 'user.roles[0]', 'user.roles[1]', 'count'])
    const marked = wrapper.findAll('[data-marked]').map((row) => row.attributes('data-path'))
    expect(marked).toEqual(['user.roles[1]', 'count'])
    await wrapper.setProps({ marked: ['item.user.name'] })
    expect(wrapper.findAll('[data-marked]').map((row) => row.attributes('data-path'))).toEqual(['user.name'])
    wrapper.unmount()
  })

  it('grows a "show more" window to reach a marked item', () => {
    const wrapper = mount(JsonTree, {
      props: { value: { data: Array.from({ length: 120 }, (_, i) => ({ title: `t${i}` })) }, pageSize: 50, basePath: 'queries.products', marked: ['queries.products.data[110].title'] },
      attachTo: document.body,
    })
    expect(wrapper.find('[data-path="data[110].title"]').attributes('data-marked')).toBe('true')
    expect(wrapper.find('[data-path="data[119]"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('emits select-path on click and Enter, keyboard reachable', async () => {
    const wrapper = tree({ basePath: 'item', expandDepth: 3 })
    await wrapper.get('[data-path="user.roles[0]"]').trigger('click')
    expect(wrapper.emitted('select-path')?.[0]).toEqual(['item.user.roles[0]'])
    const root = wrapper.get('[role=tree]')
    await root.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('data-path')).toBe('user.roles[1]')
    await root.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select-path')?.[1]).toEqual(['item.user.roles[1]'])
    // Copy buttons do not select.
    await wrapper.get('[data-path="count"] button[aria-label="Copy path"]').trigger('click')
    expect(wrapper.emitted('select-path')).toHaveLength(2)
    wrapper.unmount()
  })

  it('does not emit select-path for the root without a base path', async () => {
    const wrapper = tree()
    await wrapper.get('[data-path=""]').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select-path')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits select with the full path on Enter', async () => {
    const wrapper = tree({ basePath: 'vars' })
    const root = wrapper.get('[role=tree]')
    await root.trigger('keydown', { key: 'End' })
    await root.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')?.[0]).toEqual([{ path: 'vars.count', segments: ['count'], value: 2 }])
    wrapper.unmount()
  })
})
