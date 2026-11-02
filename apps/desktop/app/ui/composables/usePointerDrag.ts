import { onScopeDispose, ref } from 'vue'
import { ratioWithin } from '../lib/geometry'

export interface DragPoint {
  /** Pointer position inside the element, 0..1 on each axis. */
  x: number
  y: number
  event: PointerEvent
}

export interface PointerDragOptions {
  onStart?: (point: DragPoint) => void
  onMove: (point: DragPoint) => void
  onEnd?: () => void
}

/**
 * Press-and-drag on a 1D/2D surface (slider track, colour area). Captures the
 * pointer so the drag keeps working outside the element.
 */
export function usePointerDrag(options: PointerDragOptions) {
  const dragging = ref(false)
  let target: HTMLElement | null = null

  function point(event: PointerEvent): DragPoint {
    const rect = target?.getBoundingClientRect()
    return {
      x: rect ? ratioWithin(event.clientX, rect.left, rect.width) : 0,
      y: rect ? ratioWithin(event.clientY, rect.top, rect.height) : 0,
      event,
    }
  }

  function onPointerMove(event: PointerEvent): void {
    options.onMove(point(event))
  }

  function stop(): void {
    if (!target) return
    target.removeEventListener('pointermove', onPointerMove)
    target.removeEventListener('pointerup', stop)
    target.removeEventListener('pointercancel', stop)
    target = null
    dragging.value = false
    options.onEnd?.()
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
    event.preventDefault()
    target = event.currentTarget
    target.focus({ preventScroll: true })
    target.setPointerCapture(event.pointerId)
    target.addEventListener('pointermove', onPointerMove)
    target.addEventListener('pointerup', stop)
    target.addEventListener('pointercancel', stop)
    dragging.value = true
    const first = point(event)
    options.onStart?.(first)
    options.onMove(first)
  }

  onScopeDispose(stop)
  return { dragging, onPointerDown }
}
