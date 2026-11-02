import { defineComponent, h } from 'vue'

export const Icon = defineComponent({
  name: 'IconStub',
  props: { name: { type: String, default: '' }, size: { type: [Number, String], default: 16 } },
  setup(props) {
    return () => h('span', { 'data-icon': props.name })
  },
})

export const NuxtLink = defineComponent({
  name: 'NuxtLinkStub',
  props: { to: { type: [String, Object], default: '' } },
  setup(props, { slots }) {
    return () => h('a', { href: typeof props.to === 'string' ? props.to : '' }, slots.default?.())
  },
})
