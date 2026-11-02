import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createTooltipGroup, provideUiKit, useLayerStack, type LayerStack } from './uiContext'

describe('ui context', () => {
  it('shares the provided layer stack with descendants', () => {
    let provided: LayerStack | undefined
    let seen: LayerStack | undefined
    const Child = defineComponent({ setup: () => ((seen = useLayerStack()), () => h('i')) })
    const Root = defineComponent({ setup: () => ((provided = provideUiKit().layers), () => h(Child)) })
    mount(Root)
    expect(seen).toBe(provided)
  })

  it('falls back to a subtree stack shared by nested overlays', () => {
    const stacks: LayerStack[] = []
    const Inner = defineComponent({ setup: () => (stacks.push(useLayerStack()), () => h('i')) })
    const Outer = defineComponent({ setup: () => (stacks.push(useLayerStack()), () => h(Inner)) })
    mount(Outer)
    expect(stacks[0]).toBe(stacks[1])
  })

  it('skips the tooltip delay while one is open or just closed', () => {
    let now = 1000
    const group = createTooltipGroup(() => now)
    expect(group.delayFor(400)).toBe(400)
    group.opened()
    expect(group.delayFor(400)).toBe(0)
    group.closed()
    now += 100
    expect(group.delayFor(400)).toBe(0)
    now += 1000
    expect(group.delayFor(400)).toBe(400)
  })
})
