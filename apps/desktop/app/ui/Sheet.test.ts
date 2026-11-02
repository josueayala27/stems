import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import Sheet from './Sheet.vue'

describe('Sheet', () => {
  it('opens on the chosen side and closes on Escape or a backdrop press', async () => {
    const open = ref(true)
    const Host = defineComponent({
      setup: () => () =>
        h(Sheet, { open: open.value, 'onUpdate:open': (v: boolean) => (open.value = v), title: 'Filters', side: 'left' }, { default: () => h('input', { id: 'q' }) }),
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()
    await nextTick()
    const panel = document.querySelector<HTMLElement>('[role=dialog]')!
    expect(panel.dataset.side).toBe('left')
    expect(document.activeElement?.id).toBe('q')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(open.value).toBe(false)
    open.value = true
    await nextTick()
    await nextTick()
    document.querySelector('[data-part=backdrop]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(open.value).toBe(false)
    wrapper.unmount()
  })
})
