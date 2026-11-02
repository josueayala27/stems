import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TreeItem from './TreeItem.vue'

function editing() {
  return mount(TreeItem, { props: { label: 'Hero', editing: true }, attachTo: document.body })
}

describe('TreeItem rename', () => {
  it('emits the trimmed name on Enter', async () => {
    const wrapper = editing()
    const input = wrapper.get('input')
    await input.setValue('  Header  ')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('rename')).toEqual([['Header']])
    wrapper.unmount()
  })

  it("emits '' when a blank name is committed", async () => {
    const wrapper = editing()
    const input = wrapper.get('input')
    await input.setValue('   ')
    await input.trigger('blur')
    expect(wrapper.emitted('rename')).toEqual([['']])
    expect(wrapper.emitted('renameCancel')).toBeUndefined()
    wrapper.unmount()
  })

  it('cancels on Escape without renaming', async () => {
    const wrapper = editing()
    const input = wrapper.get('input')
    await input.setValue('Other')
    await input.trigger('keydown', { key: 'Escape' })
    await input.trigger('blur')
    expect(wrapper.emitted('renameCancel')).toHaveLength(1)
    expect(wrapper.emitted('rename')).toBeUndefined()
    wrapper.unmount()
  })
})
