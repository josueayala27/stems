import { inject, provide, type InjectionKey } from 'vue'
import { resolveTooltipDelay } from '../lib/tooltipDelay'

export interface Layer {
  contains: (target: Node) => boolean
}

/** Open dismissable layers in stacking order; the last one is on top. */
export interface LayerStack {
  layers: Layer[]
}

/** Shared tooltip timing so moving between tooltips skips the hover delay. */
export interface TooltipGroup {
  delayFor: (delay: number) => number
  opened: () => void
  closed: () => void
}

const LAYER_STACK: InjectionKey<LayerStack> = Symbol('malla.ui.layerStack')
const TOOLTIP_GROUP: InjectionKey<TooltipGroup> = Symbol('malla.ui.tooltipGroup')

export function createLayerStack(): LayerStack {
  return { layers: [] }
}

export function createTooltipGroup(now: () => number = Date.now): TooltipGroup {
  let lastClosedAt: number | null = null
  let openCount = 0
  return {
    delayFor: (delay) => (openCount > 0 ? 0 : resolveTooltipDelay(now(), lastClosedAt, delay)),
    opened: () => {
      openCount++
    },
    closed: () => {
      openCount = Math.max(0, openCount - 1)
      lastClosedAt = now()
    },
  }
}

export function provideLayerStack(stack: LayerStack = createLayerStack()): LayerStack {
  provide(LAYER_STACK, stack)
  return stack
}

export function provideTooltipGroup(group: TooltipGroup = createTooltipGroup()): TooltipGroup {
  provide(TOOLTIP_GROUP, group)
  return group
}

/** Call once near the app root (app.vue / EditorRoot) so every overlay shares one stack and tooltip group. */
export function provideUiKit(): { layers: LayerStack; tooltips: TooltipGroup } {
  return { layers: provideLayerStack(), tooltips: provideTooltipGroup() }
}

/**
 * Without an app-level provider, the first overlay creates a stack and provides
 * it to its own subtree, so nested overlays (a Select inside a Popover) still
 * share one. Unrelated root-level overlays then get separate stacks.
 */
export function useLayerStack(): LayerStack {
  return inject(LAYER_STACK, null) ?? provideLayerStack()
}

export function useTooltipGroup(): TooltipGroup {
  return inject(TOOLTIP_GROUP, null) ?? provideTooltipGroup()
}
