import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatePicker from './StatePicker.vue'

describe('StatePicker', () => {
  it('renders the four states with dots on overridden ones', () => {
    const wrapper = mount(StatePicker, { props: { modelValue: 'default', overridden: ['hover', 'active'] } })
    const radios = wrapper.findAll('[role=radio]')
    expect(radios.map((r) => r.text())).toEqual(['Default', 'Hover', 'Focus', 'Active'])
    expect(radios.map((r) => r.attributes('title'))).toEqual(['Default', 'Hover (has overrides)', 'Focus', 'Active (has overrides)'])
    expect(radios[0]!.attributes('aria-checked')).toBe('true')
  })

  it('updates the model on click', async () => {
    const wrapper = mount(StatePicker, { props: { modelValue: 'default' }, attachTo: document.body })
    await wrapper.findAll('[role=radio]')[2]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['focus']])
    wrapper.unmount()
  })
})
