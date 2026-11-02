import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import Input from './Input.vue'

function host(live: boolean) {
  const value = ref('')
  const commits: string[] = []
  const Host = defineComponent({
    setup: () => () => h(Input, { modelValue: value.value, live, 'onUpdate:modelValue': (v: string) => (value.value = v), onCommit: (v: string) => commits.push(v) }),
  })
  return { wrapper: mount(Host), value, commits }
}

describe('Input', () => {
  it.each([false, true])('commits on Enter after typing (live: %s)', async (live) => {
    const { wrapper, value, commits } = host(live)
    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('notes')
    expect(value.value).toBe(live ? 'notes' : '')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(commits).toEqual(['notes'])
    expect(value.value).toBe('notes')
    // Nothing changed since: no second commit.
    await input.trigger('blur')
    await nextTick()
    expect(commits).toEqual(['notes'])
  })
})
