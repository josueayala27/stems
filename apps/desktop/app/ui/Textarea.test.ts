import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { rowBounds } from './composables/useAutoGrow'
import Textarea from './Textarea.vue'

describe('Textarea', () => {
  it('commits on blur and ⌘↵, not while typing', async () => {
    const wrapper = mount(Textarea, { props: { modelValue: 'a' } })
    const el = wrapper.get('textarea')
    await el.setValue('ab')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await el.trigger('keydown', { key: 'Enter', metaKey: true })
    expect(wrapper.emitted('commit')).toEqual([['ab']])
    expect(wrapper.emitted('update:modelValue')).toEqual([['ab']])
  })

  it('reverts on Escape', async () => {
    const wrapper = mount(Textarea, { props: { modelValue: 'keep' } })
    const el = wrapper.get('textarea')
    await el.setValue('changed')
    await el.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect((el.element as HTMLTextAreaElement).value).toBe('keep')
    await el.trigger('blur')
    expect(wrapper.emitted('commit')).toBeUndefined()
  })

  it('updates live when asked and forwards class to the element', async () => {
    const wrapper = mount(Textarea, { props: { live: true }, attrs: { class: 'outer', name: 'notes' } })
    const el = wrapper.get('textarea')
    await el.setValue('x')
    expect(wrapper.emitted('update:modelValue')).toEqual([['x']])
    expect(el.classes()).toContain('outer')
    expect(el.attributes('name')).toBe('notes')
  })

  it('computes row bounds from line-height and padding', () => {
    const style = { lineHeight: '16px', fontSize: '12px', paddingTop: '6px', paddingBottom: '6px', borderTopWidth: '1px', borderBottomWidth: '1px' }
    expect(rowBounds(style, 2, 8)).toEqual({ min: 46, max: 142 })
  })
})
