import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import type { JsonSchema } from './lib/jsonSchema'
import type { SchemaFieldSlotProps } from './lib/schemaFormContext'
import SchemaForm from './SchemaForm.vue'

const schema: JsonSchema = {
  type: 'object',
  required: ['url'],
  properties: {
    url: { type: 'string', format: 'uri', description: 'Base URL' },
    method: { type: 'string', enum: ['GET', 'POST'] },
    retries: { type: 'integer', minimum: 0, maximum: 5 },
    verbose: { type: 'boolean' },
    auth: { type: 'object', properties: { token: { type: 'string', 'x-secret': true } } },
    tags: { type: 'array', items: { type: 'string' } },
  },
}

function form(initial: unknown, props: Record<string, unknown> = {}, slots: Record<string, (p: SchemaFieldSlotProps) => unknown> = {}) {
  const value = ref<unknown>(initial)
  const Host = defineComponent({
    setup: () => () => h(SchemaForm, { schema, modelValue: value.value, 'onUpdate:modelValue': (v: unknown) => (value.value = v), ...props }, slots),
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, value }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('SchemaForm', () => {
  it('renders a control per field with labels, help and required markers', () => {
    const { wrapper } = form({})
    expect(wrapper.find('[data-path=url] label').text()).toBe('Url*')
    expect(wrapper.find('[data-path=url]').text()).toContain('Base URL')
    expect(wrapper.find('[data-path=url] input').attributes('type')).toBe('url')
    expect(wrapper.find('[data-path=verbose] [role=switch]').exists()).toBe(true)
    expect(wrapper.find('fieldset[data-path=auth] legend').text()).toBe('Auth')
    wrapper.unmount()
  })

  it('writes nested values through v-model and drops emptied keys', async () => {
    const { wrapper, value } = form({ url: 'https://a.dev' })
    const input = wrapper.get('[data-path=url] input')
    await input.setValue('https://b.dev')
    await input.trigger('keydown', { key: 'Enter' })
    expect(value.value).toEqual({ url: 'https://b.dev' })
    await wrapper.get('[data-path=verbose] [role=switch]').trigger('click')
    expect(value.value).toEqual({ url: 'https://b.dev', verbose: true })
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })
    expect(value.value).toEqual({ verbose: true })
    wrapper.unmount()
  })

  it('shows validation messages after a field is visited or validate() runs', async () => {
    const { wrapper } = form({})
    expect(wrapper.find('[data-path=url] [role=alert]').exists()).toBe(false)
    await wrapper.get('[data-path=url]').trigger('focusout')
    expect(wrapper.get('[data-path=url] [role=alert]').text()).toBe('Required')
    wrapper.unmount()

    const second = form({ url: 'x' }, { showErrors: true })
    expect(second.wrapper.get('[data-path=url] [role=alert]').text()).toBe('Enter a valid URL (https://…)')
    second.wrapper.unmount()
  })

  it('adds, reorders and removes array items', async () => {
    const { wrapper, value } = form({ url: 'https://a.dev', tags: ['a', 'b'] })
    await wrapper.get('button[aria-label="Move item 2 up"]').trigger('click')
    expect(value.value).toMatchObject({ tags: ['b', 'a'] })
    await wrapper.get('[data-path=tags] li[data-index="0"]').trigger('keydown', { key: 'ArrowDown', altKey: true })
    expect(value.value).toMatchObject({ tags: ['a', 'b'] })
    await wrapper.get('[data-path=tags] button:not([aria-label])').trigger('click')
    expect(value.value).toMatchObject({ tags: ['a', 'b', ''] })
    await wrapper.get('button[aria-label="Remove item 1"]').trigger('click')
    expect(value.value).toMatchObject({ tags: ['b', ''] })
    wrapper.unmount()
  })

  it('keeps secrets write-only: set, replace, clear', async () => {
    const { wrapper, value } = form({ url: 'https://a.dev' }, { storedSecrets: ['auth.token'] })
    const secret = () => wrapper.get('[data-path="auth.token"] [data-part=secret]')
    expect(secret().text()).toContain('Saved')
    expect(secret().find('input').exists()).toBe(false)
    await secret().findAll('button').find((b) => b.text() === 'Clear')!.trigger('click')
    expect(value.value).toEqual({ url: 'https://a.dev', auth: { token: null } })
    expect(secret().text()).toContain('Will be cleared')
    await secret().findAll('button').find((b) => b.text() === 'Undo')!.trigger('click')
    expect(value.value).toEqual({ url: 'https://a.dev', auth: {} })
    await secret().findAll('button').find((b) => b.text() === 'Replace')!.trigger('click')
    const input = secret().get('input')
    expect(input.attributes('type')).toBe('password')
    await input.setValue('s3cret')
    expect(value.value).toEqual({ url: 'https://a.dev', auth: { token: 's3cret' } })
    wrapper.unmount()
  })

  it('lets a path slot replace a control and still offers the default one', async () => {
    const { wrapper, value } = form(
      { url: 'https://a.dev' },
      {},
      {
        'field:method': (p) => h('div', { 'data-custom': p.path }, [h('button', { onClick: () => p.update('POST') }, 'expr'), h(p.Default)]),
      },
    )
    const custom = wrapper.get('[data-custom=method]')
    expect(custom.find('button[aria-haspopup]').exists() || custom.findAll('button').length > 1).toBe(true)
    await custom.get('button').trigger('click')
    expect(value.value).toEqual({ url: 'https://a.dev', method: 'POST' })
    expect(wrapper.find('[data-path=url] input').exists()).toBe(true)
    wrapper.unmount()
  })
})
