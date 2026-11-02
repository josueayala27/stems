import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import DateField from './DateField.vue'

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await nextTick()
}

function focusedDay(): HTMLElement {
  return document.querySelector<HTMLElement>('[role=grid] [data-focused]')!
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('DateField', () => {
  it('opens on the selected day, moves with the keyboard and picks a date', async () => {
    let value: string | null = '2026-10-15'
    const wrapper = mount(DateField, { props: { modelValue: value, 'onUpdate:modelValue': (v: string | null) => (value = v), locale: 'en-US' }, attachTo: document.body })
    const trigger = wrapper.get('button')
    expect(trigger.text()).toContain('Oct 15, 2026')
    await trigger.trigger('click')
    await flush()
    expect(document.activeElement).toBe(focusedDay())
    expect(focusedDay().getAttribute('aria-selected')).toBe('true')
    const grid = document.querySelector('[role=grid]')!
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush()
    expect(focusedDay().getAttribute('aria-label')).toBe('Friday, October 23, 2026')
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))
    await flush()
    expect(document.querySelector('[aria-live]')?.textContent).toBe('November 2026')
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(value).toBe('2026-11-23')
    wrapper.unmount()
  })

  it('combines the day and time into an ISO instant', async () => {
    let value: string | null = null
    const wrapper = mount(DateField, { props: { withTime: true, modelValue: value, 'onUpdate:modelValue': (v: string | null) => (value = v), min: '2026-01-01' }, attachTo: document.body })
    await wrapper.get('button').trigger('click')
    await flush()
    const time = document.querySelector<HTMLInputElement>('input[type=time]')!
    time.value = '14:30'
    time.dispatchEvent(new Event('change'))
    const day = focusedDay().closest('tbody')!.querySelectorAll<HTMLButtonElement>('button:not([data-outside])')[9]!
    day.click()
    const d = new Date(value!)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(30)
    expect(d.getDate()).toBe(10)
    wrapper.unmount()
  })

  it('disables days outside min/max', async () => {
    const wrapper = mount(DateField, { props: { modelValue: '2026-10-15', min: '2026-10-10', max: '2026-10-20' }, attachTo: document.body })
    await wrapper.get('button').trigger('click')
    await flush()
    const enabled = Array.from(document.querySelectorAll<HTMLButtonElement>('[role=grid] button')).filter((b) => !b.disabled)
    expect(enabled).toHaveLength(11)
    wrapper.unmount()
  })
})
