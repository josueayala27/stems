// QA (styles, QA-STYLES-10): rejected text must not stay in the field looking applied.
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import NumberField from './NumberField.vue'

function host() {
  const value = ref('240px')
  const Host = defineComponent({
    setup: () => () =>
      h(NumberField, { modelValue: value.value, units: ['px'], min: 0, ariaLabel: 'Width', 'onUpdate:modelValue': (v: string) => (value.value = v) }),
  })
  return { wrapper: mount(Host), value }
}

async function type(wrapper: ReturnType<typeof host>['wrapper'], text: string): Promise<void> {
  const input = wrapper.find('input')
  await input.trigger('focus')
  await input.setValue(text)
  await input.trigger('keydown', { key: 'Enter' })
  await nextTick()
  await nextTick()
}

describe('NumberField rejected input', () => {
  it.each(['abc', '12px;color:red', '1e999', '12vh', '<b>'])('snaps back to the value after %s', async (junk) => {
    const { wrapper, value } = host()
    await type(wrapper, junk)
    expect(value.value).toBe('240px')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('240')
  })

  it('shows the clamped value after a negative entry', async () => {
    const { wrapper, value } = host()
    await type(wrapper, '-50')
    expect(value.value).toBe('0px')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('0')
  })
})
