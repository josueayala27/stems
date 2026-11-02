import { useMediaQuery } from '@vueuse/core'
import type { Ref } from 'vue'
import { REDUCED_MOTION_QUERY } from './reducedMotion'

/** Reactive `prefers-reduced-motion: reduce`. */
export function useReducedMotion(): Readonly<Ref<boolean>> {
  return useMediaQuery(REDUCED_MOTION_QUERY)
}
