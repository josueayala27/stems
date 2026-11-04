// Shared timeline state for one Timeline and its rows: the view (zoom and scroll), the content
// width, and helpers to place things. Provided by Timeline.vue, injected by rows and lanes.
import type { TempoGrid } from '@stems/core'
import { computed, inject, provide, ref, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { clampView, fit, sampleAt, viewEnd, xAt, zoomAt, type View } from './view'

export interface TimelineContext {
  view: Ref<View>
  /** Content width in CSS pixels (the lanes, without the header column). */
  width: Ref<number>
  length: Ref<number>
  grid: Ref<TempoGrid | null>
  end: ComputedRef<number>
  xAt: (sample: number) => number
  sampleAt: (x: number) => number
  setView: (next: View) => void
  /** Zoom by `factor` (>1 in) around content x, or the centre. */
  zoom: (factor: number, x?: number) => void
  fit: () => void
  following: Ref<boolean>
}

const KEY: InjectionKey<TimelineContext> = Symbol('timeline')

export function provideTimeline(length: Ref<number>, grid: Ref<TempoGrid | null>): TimelineContext {
  const width = ref(1)
  const view = ref<View>(fit(length.value, 1))
  const following = ref(true)
  const setView = (next: View) => {
    view.value = clampView(next, length.value, width.value)
  }
  // A new song (or the first measurement) shows the whole song.
  let fitted = false
  watch(length, () => {
    view.value = fit(length.value, width.value)
  })
  watch(width, (now, before) => {
    if (!fitted && now > 1) {
      fitted = true
      view.value = fit(length.value, now)
      return
    }
    // Keep the zoom when the window resizes, unless it showed the whole song.
    const wasFit = view.value.scale * before >= length.value - 1
    view.value = wasFit ? fit(length.value, now) : clampView(view.value, length.value, now)
  })
  const context: TimelineContext = {
    view,
    width,
    length,
    grid,
    end: computed(() => viewEnd(view.value, width.value)),
    xAt: (sample) => xAt(view.value, sample),
    sampleAt: (x) => sampleAt(view.value, x),
    setView,
    zoom: (factor, x) => setView(zoomAt(view.value, factor, x ?? width.value / 2, length.value, width.value)),
    fit: () => setView(fit(length.value, width.value)),
    following,
  }
  provide(KEY, context)
  return context
}

export function useTimeline(): TimelineContext {
  const context = inject(KEY)
  if (!context) throw new Error('useTimeline() needs a <Timeline> parent')
  return context
}
