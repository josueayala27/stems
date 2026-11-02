import { nextTick, onMounted, onScopeDispose, watch, type Ref, type WatchSource } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { gsap } from './gsap'
import { motionDuration } from './reducedMotion'
import { durations, eases } from './tokens'

export interface SlidingIndicatorOptions {
  /** Element the indicator lives in (positioned ancestor of the targets). */
  container: Ref<HTMLElement | null>
  indicator: Ref<HTMLElement | null>
  /** Returns the element the indicator should cover. */
  target: () => HTMLElement | null
  /** Re-run when this changes (usually the selected value). */
  source: WatchSource
}

/**
 * Moves an absolutely positioned indicator to cover the active item (segmented
 * controls, tab underlines). The first placement is instant; later ones glide.
 */
export function useSlidingIndicator(options: SlidingIndicatorOptions): void {
  let placed = false

  function place(animate: boolean): void {
    const el = options.indicator.value
    const target = options.target()
    if (!el) return
    if (!target) {
      gsap.set(el, { opacity: 0 })
      return
    }
    const vars = { x: target.offsetLeft, width: target.offsetWidth, opacity: 1 }
    if (!animate || !placed) gsap.set(el, vars)
    else gsap.to(el, { ...vars, duration: motionDuration(durations.normal), ease: eases.emphasized, overwrite: 'auto' })
    placed = true
  }

  onMounted(() => place(false))
  watch(options.source, () => nextTick(() => place(true)))
  useResizeObserver(options.container, () => place(false))
  onScopeDispose(() => {
    if (options.indicator.value) gsap.killTweensOf(options.indicator.value)
  })
}
