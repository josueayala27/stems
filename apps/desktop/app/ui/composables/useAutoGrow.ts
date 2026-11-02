import { nextTick, onMounted, toValue, watch, type MaybeRefOrGetter, type Ref, type WatchSource } from 'vue'

export interface AutoGrowOptions {
  minRows: MaybeRefOrGetter<number>
  maxRows: MaybeRefOrGetter<number>
  /** Re-measure when this changes (usually the text). */
  source: WatchSource
}

/** Rows → pixel height bounds from the element's own line-height, padding and border. */
export function rowBounds(style: Pick<CSSStyleDeclaration, 'lineHeight' | 'fontSize' | 'paddingTop' | 'paddingBottom' | 'borderTopWidth' | 'borderBottomWidth'>, minRows: number, maxRows: number) {
  const px = (v: string) => parseFloat(v) || 0
  const line = px(style.lineHeight) || px(style.fontSize) * 1.25
  const chrome = px(style.paddingTop) + px(style.paddingBottom) + px(style.borderTopWidth) + px(style.borderBottomWidth)
  return { min: minRows * line + chrome, max: maxRows * line + chrome }
}

/** Sizes a textarea to its content between `minRows` and `maxRows`; scrolls beyond that. */
export function useAutoGrow(el: Ref<HTMLTextAreaElement | null>, options: AutoGrowOptions): { resize: () => void } {
  function resize(): void {
    const node = el.value
    if (!node) return
    const { min, max } = rowBounds(getComputedStyle(node), toValue(options.minRows), toValue(options.maxRows))
    node.style.height = 'auto'
    const height = Math.min(max, Math.max(min, node.scrollHeight))
    node.style.height = `${height}px`
    node.style.overflowY = node.scrollHeight > max ? 'auto' : 'hidden'
  }

  onMounted(resize)
  watch([options.source, () => toValue(options.minRows), () => toValue(options.maxRows)], () => nextTick(resize))
  return { resize }
}
