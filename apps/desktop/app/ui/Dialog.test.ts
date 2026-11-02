import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import Dialog from './Dialog.vue'
import Popover from './Popover.vue'
import { provideUiKit } from './composables/uiContext'

function press(key: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
}

function host(dismissible = true) {
  const open = ref(true)
  const reasons: string[] = []
  const Host = defineComponent({
    setup() {
      provideUiKit()
      return () =>
        h(
          Dialog,
          {
            open: open.value,
            'onUpdate:open': (v: boolean) => (open.value = v),
            onDismiss: (r: string) => reasons.push(r),
            title: 'Delete item',
            description: 'This cannot be undone.',
            dismissible,
          },
          {
            default: () => h('input', { id: 'first' }),
            footer: () => [h('button', { id: 'cancel' }, 'Cancel'), h('button', { id: 'ok' }, 'Delete')],
          },
        )
    },
  })
  return { open, reasons, wrapper: mount(Host, { attachTo: document.body }) }
}

describe('Dialog', () => {
  it('labels the panel and focuses the first focusable', async () => {
    const { wrapper } = host()
    await flush()
    const panel = document.querySelector<HTMLElement>('[role=dialog]')!
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent).toBe('Delete item')
    expect(document.getElementById(panel.getAttribute('aria-describedby')!)?.textContent).toBe('This cannot be undone.')
    expect(document.activeElement?.id).toBe('first')
    wrapper.unmount()
  })

  it('closes on Escape and on a backdrop press', async () => {
    const { open, reasons, wrapper } = host()
    await flush()
    press('Escape')
    await flush()
    expect(open.value).toBe(false)
    open.value = true
    await flush()
    document.querySelector('[data-part=positioner]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flush()
    expect(open.value).toBe(false)
    expect(reasons).toEqual(['escape', 'outside'])
    wrapper.unmount()
  })

  it('stays open when not dismissible', async () => {
    const { open, wrapper } = host(false)
    await flush()
    press('Escape')
    await flush()
    expect(open.value).toBe(true)
    wrapper.unmount()
  })

  it('traps Tab inside the panel', async () => {
    const { wrapper } = host()
    await flush()
    document.getElementById('ok')!.focus()
    press('Tab')
    // Close button is the first focusable in the header.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close')
    press('Tab', { shiftKey: true })
    expect(document.activeElement?.id).toBe('ok')
    wrapper.unmount()
  })
  it('sits on the modal layer, below popovers opened inside it', async () => {
    const Host = defineComponent({
      setup: () => () => h(Dialog, { open: true, title: 'T' }, { default: () => h(Popover, { open: true }, { default: () => 'pop' }) }),
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await flush()
    const panel = document.querySelector('[data-part=positioner]')!
    const surface = Array.from(document.querySelectorAll('[role=dialog]')).find((el) => el.textContent === 'pop')!
    expect(panel.className).toContain('z_modal')
    expect(surface.className).toContain('z_popover')
    // Popover teleports after the dialog, so it also wins on DOM order.
    expect(panel.compareDocumentPosition(surface) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    wrapper.unmount()
  })
})
