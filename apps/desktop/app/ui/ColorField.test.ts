import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ColorField from './ColorField.vue'

const tokens = [
  { key: 'brand', value: '#0099ff', name: 'Brand' },
  { key: 'accent', value: '#8b5cf6' },
]

async function type(wrapper: ReturnType<typeof mount>, text: string) {
  const input = wrapper.get('input[aria-label="Colour"]')
  await input.setValue(text)
  await input.trigger('keydown', { key: 'Enter' })
  await flushPromises()
  return input
}

describe('ColorField text entry (QA-STYLES-8)', () => {
  it.each([
    ['red', '#ff0000'],
    ['RebeccaPurple', '#663399'],
    ['transparent', '#00000000'],
    ['hsl(120 100% 25%)', '#008000'],
    ['hsla(0, 100%, 50%, 0.5)', '#ff000080'],
    ['rgb(0 153 255)', '#0099ff'],
    ['rgba(255, 0, 0, .5)', '#ff000080'],
    ['f00', '#ff0000'],
    ['#f008', '#ff000088'],
    ['0099ff', '#0099ff'],
    ['0099ff80', '#0099ff80'],
  ])('accepts %s', async (text, stored) => {
    const wrapper = mount(ColorField, { props: { modelValue: '#ffffff' } })
    const input = await type(wrapper, text)
    expect(wrapper.emitted('commit')).toEqual([[stored]])
    expect(input.attributes('aria-invalid')).toBeUndefined()
    wrapper.unmount()
  })

  it('accepts currentColor and shows it', async () => {
    const wrapper = mount(ColorField, { props: { modelValue: '#ffffff', 'onUpdate:modelValue': (v: string) => wrapper.setProps({ modelValue: v }) } })
    const input = await type(wrapper, 'currentcolor')
    expect(wrapper.emitted('commit')).toEqual([['currentColor']])
    expect((input.element as HTMLInputElement).value).toBe('currentColor')
    wrapper.unmount()
  })

  it('shows an error state for invalid input instead of ignoring it', async () => {
    const wrapper = mount(ColorField, { props: { modelValue: '#ffffff' } })
    const input = await type(wrapper, 'reddish')
    expect(wrapper.emitted('commit')).toBeUndefined()
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Not a colour')
    await type(wrapper, 'blue')
    expect(input.attributes('aria-invalid')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows a stored named or hsl colour as hex', () => {
    const named = mount(ColorField, { props: { modelValue: 'red' } })
    expect((named.get('input[aria-label="Colour"]').element as HTMLInputElement).value).toBe('FF0000')
    const hsl = mount(ColorField, { props: { modelValue: 'hsl(240, 100%, 50%)' } })
    expect((hsl.get('input[aria-label="Colour"]').element as HTMLInputElement).value).toBe('0000FF')
  })
})

describe('ColorField tokens', () => {
  it('shows a matched token by name with its resolved colour', () => {
    const wrapper = mount(ColorField, { props: { modelValue: 'var(--color-brand)', tokens } })
    expect(wrapper.text()).toContain('Brand')
    const swatch = wrapper.find('[aria-label="Edit Brand"] span')
    expect(swatch.attributes('style')).toContain('#0099ff')
    wrapper.unmount()
  })

  it('writes var(--color-<key>) when a palette token is picked', async () => {
    const wrapper = mount(ColorField, { props: { modelValue: '#ffffff', tokens }, attachTo: document.body })
    await wrapper.get('[aria-label="Open colour picker"]').trigger('click')
    await flushPromises()
    const option = document.body.querySelector<HTMLButtonElement>('[role=option][aria-label="accent"]')
    expect(option).not.toBeNull()
    option!.click()
    expect(wrapper.emitted('update:modelValue')).toEqual([['var(--color-accent)']])
    expect(wrapper.emitted('commit')).toEqual([['var(--color-accent)']])
    wrapper.unmount()
  })

  it('hides the palette without tokens', async () => {
    const wrapper = mount(ColorField, { props: { modelValue: '#ffffff' }, attachTo: document.body })
    await wrapper.get('[aria-label="Open colour picker"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[aria-label="Colour tokens"]')).toBeNull()
    wrapper.unmount()
  })
})
