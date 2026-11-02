import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CodeBlock from './CodeBlock.vue'

describe('CodeBlock', () => {
  it('shows code as text and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const code = '<b>{ "a": 1 }</b>'
    const wrapper = mount(CodeBlock, { props: { code, language: 'json' } })
    expect(wrapper.get('pre').text()).toBe(code)
    expect(wrapper.find('b').exists()).toBe(false)
    await wrapper.get('button[aria-label="Copy code"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('copy')).toEqual([[code]]))
    expect(writeText).toHaveBeenCalledWith(code)
    expect(wrapper.find('button[aria-label="Copied"]').exists()).toBe(true)
  })

  it('numbers lines', () => {
    const wrapper = mount(CodeBlock, { props: { code: 'a\nb\nc', lineNumbers: true, copyable: false } })
    expect(wrapper.findAll('code').map((c) => c.text())).toEqual(['a', 'b', 'c'])
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
