import { onScopeDispose, ref } from 'vue'
import { accumulateScrub, type ScrubConfig, type ScrubState } from '../lib/scrub'

export interface ScrubOptions {
  /** Value when the drag starts. */
  getValue: () => number
  config: () => ScrubConfig
  onChange: (value: number) => void
  onStart?: () => void
  onEnd?: () => void
  /** Pointer released without dragging (e.g. focus the input). */
  onClick?: () => void
  /** Hide the cursor and allow infinite travel via the Pointer Lock API. */
  pointerLock?: () => boolean
}

const DRAG_THRESHOLD_PX = 3

/**
 * Horizontal value scrubbing (Framer's draggable field labels). Drag changes
 * the value; Shift ×10, Alt ×0.1. A press that never crosses the threshold is
 * a click.
 */
export function useScrub(options: ScrubOptions) {
  const scrubbing = ref(false)
  let handle: HTMLElement | null = null
  let pointerId = -1
  let travel = 0
  let lastX = 0
  let state: ScrubState = { value: 0, remainder: 0 }
  let previousCursor = ''

  function begin(): void {
    scrubbing.value = true
    state = { value: options.getValue(), remainder: 0 }
    previousCursor = document.documentElement.style.cursor
    document.documentElement.style.cursor = 'ew-resize'
    if (options.pointerLock?.() && handle?.requestPointerLock) {
      // Pointer lock can be refused (no user activation, iframe policy); dragging still works without it.
      Promise.resolve(handle.requestPointerLock()).catch(() => {})
    }
    options.onStart?.()
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return
    const locked = document.pointerLockElement === handle
    const dx = locked ? event.movementX : event.clientX - lastX
    lastX = event.clientX
    travel += Math.abs(dx)
    if (!scrubbing.value) {
      if (travel < DRAG_THRESHOLD_PX) return
      begin()
    }
    const nextState = accumulateScrub(state, dx, { shift: event.shiftKey, alt: event.altKey }, options.config())
    if (nextState.value !== state.value) options.onChange(nextState.value)
    state = nextState
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return
    const wasScrubbing = scrubbing.value
    cleanup()
    if (wasScrubbing) options.onEnd?.()
    else options.onClick?.()
  }

  function cleanup(): void {
    if (handle) {
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', onPointerUp)
      handle.removeEventListener('pointercancel', onPointerUp)
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
    }
    // Runs on scope disposal too, which can happen during SSR; only touch the DOM if a drag began.
    if (typeof document !== 'undefined') {
      if (handle && document.pointerLockElement === handle) document.exitPointerLock()
      if (scrubbing.value) document.documentElement.style.cursor = previousCursor
    }
    scrubbing.value = false
    handle = null
    pointerId = -1
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
    event.preventDefault()
    handle = event.currentTarget
    pointerId = event.pointerId
    travel = 0
    lastX = event.clientX
    handle.setPointerCapture(pointerId)
    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerUp)
    handle.addEventListener('pointercancel', onPointerUp)
  }

  onScopeDispose(() => {
    const wasScrubbing = scrubbing.value
    cleanup()
    if (wasScrubbing) options.onEnd?.()
  })

  return { scrubbing, onPointerDown }
}
