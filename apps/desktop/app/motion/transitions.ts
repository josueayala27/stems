// JS hook factories for Vue `<Transition :css="false">`.
import { gsap } from './gsap'
import { placementMotion } from './placement'
import { motionDuration } from './reducedMotion'
import { durations, eases } from './tokens'

export interface TransitionHooks {
  onBeforeEnter: (el: Element) => void
  onEnter: (el: Element, done: () => void) => void
  onLeave: (el: Element, done: () => void) => void
  onEnterCancelled: (el: Element) => void
  onLeaveCancelled: (el: Element) => void
}

export interface TransitionOptions {
  /** Floating placement; falls back to the element's `data-placement` attribute. */
  placement?: string
}

export type TransitionPreset = 'fade' | 'popover' | 'tooltip' | 'slideUp' | 'collapse' | 'backdrop' | 'dialog' | 'sheet'

type Vars = gsap.TweenVars

interface PresetSpec {
  from: (el: HTMLElement) => Vars
  to: (el: HTMLElement) => Vars
  leave: (el: HTMLElement) => Vars
  /** Inline props removed once the enter tween finishes. */
  clear: string
}

function placementOf(el: HTMLElement, options: TransitionOptions): string | undefined {
  return options.placement ?? el.dataset.placement
}

function presetSpec(preset: TransitionPreset, options: TransitionOptions): PresetSpec {
  switch (preset) {
    case 'fade':
      return {
        from: () => ({ opacity: 0 }),
        to: () => ({ opacity: 1, duration: durations.fast, ease: eases.standard }),
        leave: () => ({ opacity: 0, duration: durations.instant, ease: eases.standard }),
        clear: 'opacity',
      }
    case 'popover':
      return {
        from: (el) => {
          const m = placementMotion(placementOf(el, options), 4)
          return { opacity: 0, scale: 0.96, x: m.x, y: m.y, transformOrigin: m.origin }
        },
        to: () => ({ opacity: 1, scale: 1, x: 0, y: 0, duration: durations.fast, ease: eases.emphasized }),
        leave: () => ({ opacity: 0, scale: 0.98, duration: durations.instant, ease: eases.standard }),
        clear: 'opacity,transform,transformOrigin',
      }
    case 'tooltip':
      return {
        from: (el) => {
          const m = placementMotion(placementOf(el, options), 2)
          return { opacity: 0, x: m.x, y: m.y }
        },
        to: () => ({ opacity: 1, x: 0, y: 0, duration: durations.instant, ease: eases.standard }),
        leave: () => ({ opacity: 0, duration: durations.instant, ease: eases.standard }),
        clear: 'opacity,transform',
      }
    case 'slideUp':
      return {
        from: () => ({ opacity: 0, y: 8 }),
        to: () => ({ opacity: 1, y: 0, duration: durations.normal, ease: eases.emphasized }),
        leave: () => ({ opacity: 0, y: 8, duration: durations.fast, ease: eases.standard }),
        clear: 'opacity,transform',
      }
    case 'backdrop':
      return {
        from: () => ({ opacity: 0 }),
        to: () => ({ opacity: 1, duration: durations.normal, ease: eases.standard }),
        leave: () => ({ opacity: 0, duration: durations.fast, ease: eases.standard }),
        clear: 'opacity',
      }
    case 'dialog':
      return {
        from: () => ({ opacity: 0, scale: 0.96, y: 8 }),
        to: () => ({ opacity: 1, scale: 1, y: 0, duration: durations.normal, ease: eases.emphasized }),
        leave: () => ({ opacity: 0, scale: 0.98, y: 4, duration: durations.fast, ease: eases.standard }),
        clear: 'opacity,transform',
      }
    case 'sheet': {
      // `placement` is the edge the sheet is attached to.
      const sign = (el: HTMLElement) => (placementOf(el, options) === 'left' ? -1 : 1)
      return {
        from: (el) => ({ xPercent: 100 * sign(el), opacity: 0.6 }),
        to: () => ({ xPercent: 0, opacity: 1, duration: durations.normal, ease: eases.emphasized }),
        leave: (el) => ({ xPercent: 100 * sign(el), opacity: 0.6, duration: durations.fast, ease: eases.standard }),
        clear: 'opacity,transform',
      }
    }
    case 'collapse':
      return {
        from: () => ({ height: 0, opacity: 0, overflow: 'hidden' }),
        to: () => ({ height: 'auto', opacity: 1, duration: durations.normal, ease: eases.standard }),
        leave: () => ({ height: 0, opacity: 0, overflow: 'hidden', duration: durations.fast, ease: eases.standard }),
        clear: 'height,opacity,overflow',
      }
  }
}

function asHtml(el: Element): HTMLElement | null {
  return el instanceof HTMLElement ? el : null
}

// A leaving element is on its way out: it must not swallow clicks meant for what is underneath
// (e.g. a workspace panel sliding away over the canvas). Entering again or a cancelled leave restores it.
function setInteractive(el: Element, interactive: boolean): void {
  const node = asHtml(el)
  if (node) node.style.pointerEvents = interactive ? '' : 'none'
}

/** Builds the hook set for a preset. Reduced motion makes every tween instant. */
export function createTransitionHooks(preset: TransitionPreset, options: TransitionOptions = {}): TransitionHooks {
  const spec = presetSpec(preset, options)

  return {
    onBeforeEnter(el) {
      setInteractive(el, true)
      const node = asHtml(el)
      if (node) gsap.set(node, spec.from(node))
    },
    onEnter(el, done) {
      const node = asHtml(el)
      if (!node) return done()
      const to = spec.to(node)
      gsap.to(node, {
        ...to,
        duration: motionDuration(Number(to.duration ?? 0)),
        clearProps: spec.clear,
        onComplete: done,
      })
    },
    onLeave(el, done) {
      const node = asHtml(el)
      if (!node) return done()
      setInteractive(node, false)
      gsap.killTweensOf(node)
      const leave = spec.leave(node)
      gsap.to(node, { ...leave, duration: motionDuration(Number(leave.duration ?? 0)), onComplete: done })
    },
    onEnterCancelled(el) {
      gsap.killTweensOf(el)
    },
    onLeaveCancelled(el) {
      gsap.killTweensOf(el)
      setInteractive(el, true)
    },
  }
}

export const fade = (options?: TransitionOptions) => createTransitionHooks('fade', options)
export const popover = (options?: TransitionOptions) => createTransitionHooks('popover', options)
export const tooltip = (options?: TransitionOptions) => createTransitionHooks('tooltip', options)
export const slideUp = (options?: TransitionOptions) => createTransitionHooks('slideUp', options)
export const collapse = (options?: TransitionOptions) => createTransitionHooks('collapse', options)
export const backdrop = (options?: TransitionOptions) => createTransitionHooks('backdrop', options)
export const dialog = (options?: TransitionOptions) => createTransitionHooks('dialog', options)
export const sheet = (options?: TransitionOptions) => createTransitionHooks('sheet', options)
