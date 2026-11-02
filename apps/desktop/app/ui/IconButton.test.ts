import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import IconButton from './IconButton.vue'
import Input from './Input.vue'
import Menu from './Menu.vue'
import Select from './Select.vue'

describe('attribute forwarding through fragment roots', () => {
  it('IconButton passes listeners and aria attrs to the <button>', async () => {
    const onClick = vi.fn()
    const wrapper = mount(IconButton, {
      props: { icon: 'lucide:plus', label: 'Add' },
      attrs: { onClick, 'aria-expanded': 'true', 'data-test': 'x' },
      attachTo: document.body,
    })
    const button = wrapper.get('button')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.attributes('data-test')).toBe('x')
    expect(button.attributes('aria-label')).toBe('Add')
    await button.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('Menu trigger props reach an IconButton trigger and open the menu', async () => {
    const Host = defineComponent({
      setup: () => () =>
        h(Menu, { items: [{ id: 'a', label: 'A' }] }, {
          trigger: ({ props }: { props: Record<string, unknown> }) => h(IconButton, { icon: 'lucide:ellipsis', label: 'More', ...props }),
        }),
    })
    const wrapper = mount(Host, { attachTo: document.body })
    const button = wrapper.get('button')
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')
    await nextTick()
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(document.body.querySelector('[role=menu]')).not.toBeNull()
    wrapper.unmount()
  })

  it('Select forwards attrs to its trigger button', () => {
    const wrapper = mount(Select, {
      props: { options: [{ value: 'a', label: 'A' }] },
      attrs: { 'data-test': 'sel' },
      attachTo: document.body,
    })
    expect(wrapper.get('button[role=combobox]').attributes('data-test')).toBe('sel')
    wrapper.unmount()
  })

  it('Input puts class on the shell and other attrs on the native input', () => {
    const wrapper = mount(Input, { attrs: { class: 'outer', inputmode: 'decimal' } })
    expect(wrapper.get('label').classes()).toContain('outer')
    expect(wrapper.get('input').classes()).not.toContain('outer')
    expect(wrapper.get('input').attributes('inputmode')).toBe('decimal')
  })
})

describe('Input native attributes', () => {
  it('supports password type and an overridable autocomplete', () => {
    const wrapper = mount(Input, { props: { type: 'password', autocomplete: 'current-password' } })
    expect(wrapper.get('input').attributes('type')).toBe('password')
    expect(wrapper.get('input').attributes('autocomplete')).toBe('current-password')
    expect(mount(Input).get('input').attributes('autocomplete')).toBe('off')
  })
})
