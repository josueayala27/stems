// The visible sample range of a Timeline, for drawing outside its rows' scope (waveforms).
import { computed, type Ref } from 'vue'
import type { TimelineContext } from './useTimeline'

export function useTimelineRange(timeline: Ref<{ timeline: TimelineContext } | null>) {
  return computed(() => {
    const context = timeline.value?.timeline
    return context ? { start: context.view.value.start, end: context.end.value } : { start: 0, end: undefined as number | undefined }
  })
}
