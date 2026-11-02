<script setup lang="ts">
import { css, cva } from 'styled-system/css'
import { computed } from 'vue'
import { useClipboard } from './composables/useClipboard'
import IconButton from './IconButton.vue'

/**
 * Read-only monospace code with a copy button. It shows `code` exactly as given; an optional default
 * slot can replace it with pre-highlighted markup (the docs pass the Shiki spans here). Copying always
 * uses `code`, so the raw text survives highlighting.
 */
const props = withDefaults(
  defineProps<{
    code: string
    /** Shown as a small label in the header (e.g. `json`, `html`). */
    language?: string
    /** Wrap long lines instead of scrolling horizontally. */
    wrap?: boolean
    lineNumbers?: boolean
    copyable?: boolean
    /** Scroll beyond this height (a CSS length, e.g. `240px`). */
    maxHeight?: string
    ariaLabel?: string
  }>(),
  { language: undefined, wrap: false, lineNumbers: false, copyable: true, maxHeight: undefined, ariaLabel: 'Code' },
)

const emit = defineEmits<{ copy: [text: string] }>()

const { copy, copied } = useClipboard()
const lines = computed(() => props.code.split('\n'))

async function onCopy(): Promise<void> {
  if (await copy(props.code)) emit('copy', props.code)
}

const root = css({ position: 'relative', display: 'flex', flexDirection: 'column', minW: '0', bg: 'bg.input', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'sm' })
const header = css({ display: 'flex', alignItems: 'center', gap: '1', minH: 'control.sm', pl: '2', pr: '0.5', borderBottomWidth: '1px', borderColor: 'border.default' })
const lang = css({ textStyle: 'ui.label', color: 'fg.subtle', textTransform: 'uppercase', mr: 'auto' })
const floating = css({ position: 'absolute', top: '0.5', right: '0.5', zIndex: 'overlay' })
const pre = cva({
  base: {
    m: '0',
    p: '2',
    overflow: 'auto',
    textStyle: 'ui.mono',
    color: 'fg.default',
    tabSize: '2',
    _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[-2px]', borderRadius: 'sm' },
  },
  variants: {
    wrap: { true: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }, false: { whiteSpace: 'pre' } },
    numbered: { true: { display: 'grid', gridTemplateColumns: '[auto minmax(0, 1fr)]', columnGap: '3' }, false: {} },
  },
})
const gutter = css({ color: 'fg.subtle', textAlign: 'right', userSelect: 'none' })
</script>

<template>
  <div :class="root" data-part="code-block">
    <div v-if="language" :class="header">
      <span :class="lang">{{ language }}</span>
      <IconButton v-if="copyable" :icon="copied ? 'lucide:check' : 'lucide:copy'" :label="copied ? 'Copied' : 'Copy code'" size="sm" @click="onCopy" />
    </div>
    <IconButton v-else-if="copyable" :class="floating" :icon="copied ? 'lucide:check' : 'lucide:copy'" :label="copied ? 'Copied' : 'Copy code'" size="sm" @click="onCopy" />
    <!-- Focusable so keyboard users can scroll overflowing code. -->
    <pre
      v-if="lineNumbers"
      tabindex="0"
      :aria-label="ariaLabel"
      :class="pre({ wrap, numbered: true })"
      :style="maxHeight ? { maxHeight } : undefined"
    ><template v-for="(line, i) in lines" :key="i"><span :class="gutter" aria-hidden="true">{{ i + 1 }}</span><code>{{ line }}</code></template></pre>
    <pre
      v-else
      tabindex="0"
      :aria-label="ariaLabel"
      :class="pre({ wrap, numbered: false })"
      :style="maxHeight ? { maxHeight } : undefined"
    ><slot><code>{{ code }}</code></slot></pre>
  </div>
</template>
