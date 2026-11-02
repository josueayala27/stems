import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FileDrop from './FileDrop.vue'

function dropEvent(type: string, files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } })
  return event
}

describe('FileDrop', () => {
  it('shows the drag state and emits accepted and rejected dropped files', async () => {
    const wrapper = mount(FileDrop, { props: { accept: 'image/*', maxSize: 100 } })
    const zone = wrapper.get('[role=button]')
    zone.element.dispatchEvent(dropEvent('dragenter', []))
    await wrapper.vm.$nextTick()
    expect(zone.attributes('data-dragging')).toBeDefined()
    const ok = new File(['x'], 'a.png', { type: 'image/png' })
    const big = new File(['x'.repeat(200)], 'b.png', { type: 'image/png' })
    const txt = new File(['x'], 'c.txt', { type: 'text/plain' })
    zone.element.dispatchEvent(dropEvent('drop', [ok, big, txt]))
    await wrapper.vm.$nextTick()
    expect(zone.attributes('data-dragging')).toBeUndefined()
    expect(wrapper.emitted('files')?.[0]).toEqual([[ok]])
    expect((wrapper.emitted('reject')?.[0]?.[0] as Array<{ reason: string }>).map((r) => r.reason)).toEqual(['size', 'type'])
    expect(zone.text()).toContain('image/* · up to 100 B')
  })

  it('opens the picker on click and Enter, not when disabled', async () => {
    const wrapper = mount(FileDrop)
    const click = vi.spyOn(wrapper.get('input').element, 'click')
    await wrapper.get('[role=button]').trigger('click')
    await wrapper.get('[role=button]').trigger('keydown', { key: 'Enter' })
    expect(click).toHaveBeenCalledTimes(2)
    await wrapper.setProps({ disabled: true })
    await wrapper.get('[role=button]').trigger('click')
    expect(click).toHaveBeenCalledTimes(2)
  })
})
