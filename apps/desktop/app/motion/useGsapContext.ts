import { onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue'
import { gsap } from './gsap'

export interface GsapScope {
  /** Runs `fn` inside the context so its tweens are reverted with the owner. */
  add: (fn: () => void) => void
  revert: () => void
}

/**
 * A `gsap.context` bound to the current component (or effect scope).
 * Selector strings inside `add` resolve within `scope`; everything created is
 * reverted when the scope is disposed.
 */
export function useGsapContext(scope?: MaybeRefOrGetter<Element | null | undefined>): GsapScope {
  let ctx: gsap.Context | null = null

  function add(fn: () => void): void {
    // Created lazily so a template ref scope is resolved by the time it is used.
    ctx ??= gsap.context(() => {}, toValue(scope) ?? undefined)
    ctx.add(fn)
  }

  function revert(): void {
    ctx?.revert()
    ctx = null
  }

  onScopeDispose(revert)
  return { add, revert }
}
