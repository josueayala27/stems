import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import Combobox from './Combobox.vue'
import MultiCombobox from './MultiCombobox.vue'
import type { ComboboxOption } from './types'

const fruits: ComboboxOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana', disabled: true },
  { value: 'c', label: 'Cherry' },
]

function options(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role=option]'))
}

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await nextTick()
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('Combobox', () => {
  it('filters static options, navigates with arrows and picks with Enter', async () => {
    const wrapper = mount(Combobox, { props: { options: fruits, ariaLabel: 'Fruit' }, attachTo: document.body })
    const input = wrapper.get('input')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await flush()
    expect(input.attributes('aria-expanded')).toBe('true')
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Apple', 'Banana', 'Cherry'])
    expect(input.attributes('aria-activedescendant')).toBe(options()[0]!.id)
    // Banana is disabled, so ArrowDown skips to Cherry.
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.attributes('aria-activedescendant')).toBe(options()[2]!.id)
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['c'])
    await wrapper.setProps({ modelValue: 'c' })
    await flush()
    expect(input.element.value).toBe('Cherry')
    await input.setValue('app')
    await flush()
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Apple'])
    wrapper.unmount()
  })

  it('debounces async search and keeps only the latest result', async () => {
    vi.useFakeTimers()
    const search = vi.fn(async (q: string) => fruits.filter((f) => f.label.toLowerCase().startsWith(q.toLowerCase())))
    const wrapper = mount(Combobox, { props: { search, debounce: 200 }, attachTo: document.body })
    const input = wrapper.get('input')
    await input.trigger('click')
    await vi.runAllTimersAsync()
    expect(search).toHaveBeenLastCalledWith('')
    await input.setValue('c')
    await input.setValue('ch')
    await vi.advanceTimersByTimeAsync(100)
    expect(search).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    await flush()
    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenLastCalledWith('ch')
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Cherry'])
    wrapper.unmount()
  })

  it('offers a create row when nothing matches exactly', async () => {
    const wrapper = mount(Combobox, { props: { options: fruits, creatable: true }, attachTo: document.body })
    const input = wrapper.get('input')
    await input.setValue('Kiwi')
    await flush()
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Create “Kiwi”'])
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('create')?.[0]).toEqual(['Kiwi'])
    await input.setValue('apple')
    await flush()
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Apple'])
    wrapper.unmount()
  })

  it('shows labelFor for values outside the loaded options', () => {
    const wrapper = mount(Combobox, { props: { options: [], modelValue: 'x1', labelFor: (v: string) => `Item ${v}` }, attachTo: document.body })
    expect(wrapper.get('input').element.value).toBe('Item x1')
    wrapper.unmount()
  })
})

describe('MultiCombobox', () => {
  it('toggles values, keeps the list open, renders chips and removes with Backspace', async () => {
    let value: string[] = []
    const wrapper = mount(MultiCombobox, {
      props: { options: fruits, modelValue: value, 'onUpdate:modelValue': (v: string[]) => (value = v) },
      attachTo: document.body,
    })
    const input = wrapper.get('input')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await flush()
    await input.trigger('keydown', { key: 'Enter' })
    expect(value).toEqual(['a'])
    await wrapper.setProps({ modelValue: value })
    await flush()
    expect(input.attributes('aria-expanded')).toBe('true')
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true')
    options()[2]!.click()
    expect(value).toEqual(['a', 'c'])
    await wrapper.setProps({ modelValue: value })
    expect(wrapper.findAll('[data-part=chip-label]').map((c) => c.text())).toEqual(['Apple', 'Cherry'])
    await wrapper.get('button[aria-label="Remove Apple"]').trigger('click')
    expect(value).toEqual(['c'])
    await wrapper.setProps({ modelValue: value })
    await input.trigger('keydown', { key: 'Backspace' })
    expect(value).toEqual([])
    wrapper.unmount()
  })
})
