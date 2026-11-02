import { onBeforeUnmount, onMounted } from 'vue'
import { gsap, ScrollSmoother, ScrollTrigger } from './gsap'
import { prefersReducedMotion } from './reducedMotion'

export interface ScrollSmootherOptions {
  /** Pixels kept clear at the top when jumping to an in-page anchor, e.g. a fixed header's height. */
  anchorOffset?: number
}

/**
 * Smooth-scrolls the page with GSAP's ScrollSmoother while the calling component is mounted. The page renders
 * `#smooth-wrapper > #smooth-content` around everything that scrolls; fixed elements (the header) stay outside,
 * since the content moves with transforms. `data-speed` / `data-lag` inside the content get parallax.
 * Same-page `#anchor` links go through the smoother (native hash jumps don't see the transform).
 * Skipped under reduced motion; touch devices keep native scrolling.
 */
export function useScrollSmoother(options: ScrollSmootherOptions = {}): void {
  const { anchorOffset = 0 } = options
  let smoother: ScrollSmoother | undefined

  function onAnchorClick(event: MouseEvent): void {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
    const target = link && document.getElementById(link.hash.slice(1))
    if (!smoother || !target) return
    event.preventDefault()
    smoother.scrollTo(target, true, `top ${anchorOffset}px`)
    history.replaceState(null, '', link.hash)
  }

  onMounted(() => {
    if (prefersReducedMotion()) return
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother)
    smoother = ScrollSmoother.create({ smooth: 1.1, effects: true, smoothTouch: false })
    document.addEventListener('click', onAnchorClick)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', onAnchorClick)
    smoother?.kill()
    smoother = undefined
  })
}
