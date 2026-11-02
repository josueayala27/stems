import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import KeyValueEditor from './KeyValueEditor.vue'
import type { KeyValuePair } from './types'

function editor(initial: KeyValuePair[]) {
  const value = ref(initial)
  const wrapper = mount(
    defineComponent({
      setup: () => () => h(KeyValueEditor<string>, { modelValue: value.value, 'onUpdate:modelValue': (v: KeyValuePair[]) => (value.value = v) }),
    }),
    { attachTo: document.body },
  )
  return { wrapper, value }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('KeyValueEditor', () => {
  it('adds, edits and removes rows', async () => {
    const { wrapper, value } = editor([{ key: 'Accept', value: 'json' }])
    await wrapper.get('button:not([aria-label])').trigger('click')
    expect(value.value).toEqual([{ key: 'Accept', value: 'json' }, { key: '', value: '' }])
    const key = wrapper.get('input[aria-label="Key 2"]')
    await key.setValue('X-Id')
    await key.trigger('keydown', { key: 'Enter' })
    expect(value.value[1]).toEqual({ key: 'X-Id', value: '' })
    await wrapper.get('button[aria-label="Remove Accept"]').trigger('click')
    expect(value.value).toEqual([{ key: 'X-Id', value: '' }])
    wrapper.unmount()
  })

  it('warns about duplicate keys', () => {
    const { wrapper } = editor([{ key: 'a', value: '1' }, { key: ' a ', value: '2' }, { key: 'b', value: '3' }])
    expect(wrapper.text().match(/Duplicate key/g)).toHaveLength(2)
    expect(wrapper.get('input[aria-label="Key 1"]').attributes('aria-describedby')).toBeTruthy()
    expect(wrapper.get('input[aria-label="Key 3"]').attributes('aria-describedby')).toBeUndefined()
    wrapper.unmount()
  })

  it('reorders with Alt+Arrow on the handle', async () => {
    const { wrapper, value } = editor([{ key: 'a', value: '1' }, { key: 'b', value: '2' }])
    await wrapper.get('button[aria-label="Reorder a"]').trigger('keydown', { key: 'ArrowDown', altKey: true })
    await vi.waitFor(() => expect(value.value.map((p) => p.key)).toEqual(['b', 'a']))
    wrapper.unmount()
  })

  it('lets the value slot replace the control', async () => {
    const value = ref<KeyValuePair<number>[]>([{ key: 'n', value: 1 }])
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            KeyValueEditor<number>,
            { modelValue: value.value, newValue: () => 0, 'onUpdate:modelValue': (v: KeyValuePair<number>[]) => (value.value = v) },
            { value: (p: { value: number; update: (v: number) => void }) => h('button', { 'data-inc': '', onClick: () => p.update(p.value + 1) }, String(p.value)) },
          ),
      }),
      { attachTo: document.body },
    )
    await wrapper.get('[data-inc]').trigger('click')
    expect(value.value).toEqual([{ key: 'n', value: 2 }])
    wrapper.unmount()
  })
})
