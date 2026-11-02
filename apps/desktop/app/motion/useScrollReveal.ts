import { useHead } from '#imports'
import { onBeforeUnmount, onMounted } from 'vue'
import { gsap, ScrollTrigger, SplitText } from './gsap'
import { prefersReducedMotion } from './reducedMotion'

/** Class on `<html>` that hides every `[data-reveal]` element until its start state is set (see `globalCss`). */
const PENDING_CLASS = 'reveal-pending'

/** How long content may stay hidden if the animations never start (script error, slow fonts), in ms. */
const PENDING_TIMEOUT = 2500

// Runs in <head> before first paint, so nothing flashes before it animates in. Skipped under reduced motion.
const PENDING_SCRIPT = `(function(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.classList.add('${PENDING_CLASS}');setTimeout(function(){d.classList.remove('${PENDING_CLASS}')},${PENDING_TIMEOUT})})()`

/** Fast out of the gate, long soft landing: the marketing pages' one ease. */
const EASE = 'expo.out'

/** Grows SplitText masks past tight line-heights so descenders aren't clipped, without moving the layout. */
function padMasks(split: SplitText): void {
  gsap.set(split.masks, { paddingBlock: '0.14em', marginBlock: '-0.14em' })
}

/**
 * Entrance and scroll motion for marketing pages, driven by `data-reveal` attributes in the markup:
 *
 * - `hero-title`: words rise out of line masks on load; then `hero-item`s fade up, then `hero-stage`.
 * - `lines`: a heading's lines rise out of masks when it scrolls into view.
 * - `fade`: rises and fades in on scroll. `stagger`: its children do, in batches as they reach the screen.
 * - `tilt` (scrubbed): a stage leans back in perspective and straightens as the page scrolls.
 * - `expand` (scrubbed): a block opens from an inset, rounded clip to full width.
 * - `rail` (scrubbed): a line that draws itself left to right.
 * - `words` (scrubbed): a paragraph's words light up one by one as it scrolls through the screen.
 * - `story` (from `lg`): its `[data-story-panel]` pins while the `[data-story-step]`s scroll past; the step at the
 *   centre of the screen and the matching `[data-story-visual]` (same index) get `data-active="true"`.
 * - `horizontal` (from `md`): the section pins and its `[data-track]` slides sideways with the scroll.
 *
 * Works with `useScrollSmoother` (call that first): triggers read the smoothed scroll. Everything is set up
 * after fonts load (so text splits on final line breaks) and reverted on unmount. Reduced motion: no motion.
 */
export function useScrollReveal(): void {
  let ctx: gsap.Context | undefined
  let mm: gsap.MatchMedia | undefined
  let unmounted = false

  useHead({ script: [{ key: 'reveal-pending', tagPosition: 'head', innerHTML: PENDING_SCRIPT }] })

  function hero(): void {
    const title = document.querySelector('[data-reveal="hero-title"]')
    if (title) {
      SplitText.create(title, {
        type: 'lines,words',
        mask: 'lines',
        autoSplit: true,
        onSplit: (self) => {
          padMasks(self)
          return gsap.from(self.words, { yPercent: 120, duration: 1.3, ease: EASE, stagger: 0.06, delay: 0.1 })
        },
      })
    }
    gsap.from('[data-reveal="hero-item"]', { y: 24, autoAlpha: 0, duration: 1.1, ease: EASE, stagger: 0.08, delay: 0.5 })
    gsap.from('[data-reveal="hero-stage"]', { y: 120, autoAlpha: 0, duration: 1.8, ease: EASE, delay: 0.75 })
  }

  function lines(): void {
    gsap.utils.toArray<HTMLElement>('[data-reveal="lines"]').forEach((el) => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        onSplit: (self) => {
          padMasks(self)
          return gsap.from(self.lines, { yPercent: 120, duration: 1.2, ease: EASE, stagger: 0.1, scrollTrigger: { trigger: el, start: 'top 88%', once: true } })
        },
      })
    })
  }

  function reveals(): void {
    gsap.utils.toArray<HTMLElement>('[data-reveal="fade"]').forEach((el) => {
      gsap.from(el, { y: 28, autoAlpha: 0, duration: 1.1, ease: EASE, scrollTrigger: { trigger: el, start: 'top 90%', once: true } })
    })
    gsap.utils.toArray<HTMLElement>('[data-reveal="stagger"]').forEach((group) => {
      const items = Array.from(group.children)
      // CSS transitions pause while GSAP moves the items (they would smear the tween), then come back for hover.
      gsap.set(items, { y: 48, autoAlpha: 0, transition: 'none' })
      ScrollTrigger.batch(items, {
        start: 'top 92%',
        once: true,
        onEnter: batch => gsap.to(batch, { y: 0, autoAlpha: 1, duration: 1.1, ease: EASE, stagger: 0.08, clearProps: 'transform,transition' }),
      })
    })
  }

  function scrubs(): void {
    gsap.utils.toArray<HTMLElement>('[data-reveal="tilt"]').forEach((el) => {
      gsap.fromTo(el, { rotateX: 22, scale: 0.9, transformPerspective: 1600, transformOrigin: 'center top' }, { rotateX: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 20%', scrub: true } })
    })
    gsap.utils.toArray<HTMLElement>('[data-reveal="expand"]').forEach((el) => {
      gsap.fromTo(el, { clipPath: 'inset(0% 5% 0% 5% round 40px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 25%', scrub: true } })
    })
    gsap.utils.toArray<HTMLElement>('[data-reveal="rail"]').forEach((el) => {
      gsap.fromTo(el, { scaleX: 0 }, { scaleX: 1, ease: 'none', transformOrigin: 'left center', scrollTrigger: { trigger: el, start: 'top 80%', end: 'top 35%', scrub: true } })
    })
  }

  function words(): void {
    gsap.utils.toArray<HTMLElement>('[data-reveal="words"]').forEach((el) => {
      SplitText.create(el, {
        type: 'words',
        autoSplit: true,
        onSplit: self => gsap.fromTo(self.words, { opacity: 0.16 }, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true } }),
      })
    })
  }

  /** Pinned and sideways effects only make sense on wide screens; narrow ones get a plain vertical page. */
  function pinned(): void {
    mm = gsap.matchMedia()
    mm.add('(min-width: 1024px)', () => {
      gsap.utils.toArray<HTMLElement>('[data-reveal="story"]').forEach((section) => {
        const panel = section.querySelector<HTMLElement>('[data-story-panel]')
        const steps = gsap.utils.toArray<HTMLElement>(section.querySelectorAll('[data-story-step]'))
        const visuals = gsap.utils.toArray<HTMLElement>(section.querySelectorAll('[data-story-visual]'))
        if (!panel || !steps.length) return
        const activate = (index: number): void => {
          steps.forEach((step, i) => { step.dataset.active = String(i === index) })
          visuals.forEach((visual, i) => { visual.dataset.active = String(i === index) })
        }
        activate(0)
        ScrollTrigger.create({ trigger: panel, start: 'top top', endTrigger: section, end: 'bottom bottom', pin: panel, pinSpacing: false })
        steps.forEach((step, i) => {
          ScrollTrigger.create({ trigger: step, start: 'top center', end: 'bottom center', onToggle: self => self.isActive && activate(i) })
        })
      })
    })
    mm.add('(min-width: 768px)', () => {
      gsap.utils.toArray<HTMLElement>('[data-reveal="horizontal"]').forEach((section) => {
        const track = section.querySelector<HTMLElement>('[data-track]')
        if (!track) return
        const distance = (): number => Math.max(0, track.scrollWidth - section.clientWidth)
        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 1, invalidateOnRefresh: true },
        })
      })
    })
  }

  onMounted(async () => {
    const root = document.documentElement
    if (prefersReducedMotion()) {
      root.classList.remove(PENDING_CLASS)
      return
    }
    gsap.registerPlugin(ScrollTrigger, SplitText)
    await document.fonts.ready
    if (unmounted) return
    ctx = gsap.context(() => {
      hero()
      lines()
      reveals()
      scrubs()
      words()
    })
    pinned()
    // Every element now holds its start state inline, so the page-wide hiding can go.
    root.classList.remove(PENDING_CLASS)
    ScrollTrigger.refresh()
  })

  onBeforeUnmount(() => {
    unmounted = true
    mm?.revert()
    ctx?.revert()
    document.documentElement.classList.remove(PENDING_CLASS)
  })
}
