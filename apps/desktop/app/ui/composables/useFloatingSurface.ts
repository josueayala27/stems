import { autoUpdate, flip, offset, shift, size, useFloating, type Placement, type ReferenceElement } from '@floating-ui/vue'
import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue'

export interface FloatingSurfaceOptions {
  open: MaybeRefOrGetter<boolean>
  placement?: MaybeRefOrGetter<Placement>
  /** Gap between anchor and surface in px. */
  offset?: number
  /** Make the surface at least as wide as the anchor (selects). */
  matchWidth?: boolean
}

const VIEWPORT_PADDING = 8

/**
 * Anchored positioning for teleported surfaces: offset, flip and shift inside
 * the viewport, constrained max-height, live updates while open. Uses top/left
 * (not transform) so GSAP owns the transform for enter/leave motion.
 */
export function useFloatingSurface(
  reference: Readonly<Ref<ReferenceElement | null | undefined>>,
  floating: Readonly<Ref<HTMLElement | null | undefined>>,
  options: FloatingSurfaceOptions,
) {
  const {
    floatingStyles: rawStyles,
    placement,
    isPositioned,
    update,
  } = useFloating(reference, floating, {
    open: () => toValue(options.open),
    placement: () => toValue(options.placement) ?? 'bottom-start',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: computed(() => [
      offset(options.offset ?? 6),
      flip({ padding: VIEWPORT_PADDING }),
      shift({ padding: VIEWPORT_PADDING }),
      size({
        padding: VIEWPORT_PADDING,
        apply({ availableHeight, rects, elements }) {
          elements.floating.style.maxHeight = `${Math.max(120, availableHeight)}px`
          if (options.matchWidth) elements.floating.style.minWidth = `${rects.reference.width}px`
        },
      }),
    ]),
  })

  // Until the first measurement the surface sits at (0, 0): clip it away so it never flashes in
  // the top-left corner while the enter motion starts (QA-UI-4). A clip (not `visibility: hidden`)
  // keeps it focusable, so autofocus on open still lands inside it.
  const floatingStyles = computed(() =>
    isPositioned.value || !reference.value ? rawStyles.value : { ...rawStyles.value, clipPath: 'inset(50%)', pointerEvents: 'none' as const },
  )

  return { floatingStyles, placement, isPositioned, update }
}

export type { Placement, ReferenceElement }
