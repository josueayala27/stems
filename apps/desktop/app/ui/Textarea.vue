<script setup lang="ts">
import { cva } from 'styled-system/css'
import { computed, nextTick, ref, useAttrs, watch } from 'vue'
import { useAutoGrow } from './composables/useAutoGrow'

// class/style size the shell; every other attr and listener targets the native textarea.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    minRows?: number
    maxRows?: number
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    /** Update the model on every keystroke instead of on commit. */
    live?: boolean
    mono?: boolean
    invalid?: boolean
    ariaLabel?: string
  }>(),
  {
    minRows: 2,
    maxRows: 8,
    placeholder: undefined,
    disabled: false,
    readonly: false,
    live: false,
    mono: false,
    invalid: false,
    ariaLabel: undefined,
  },
)

const model = defineModel<string>({ default: '' })

const emit = defineEmits<{
  /** Blur or ⌘/Ctrl+Enter with a changed value. */
  commit: [value: string]
  /** Escape: the draft was reverted. */
  cancel: []
}>()

const attrs = useAttrs()
const fieldAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const textarea = ref<HTMLTextAreaElement | null>(null)
const draft = ref(model.value)

watch(model, (value) => (draft.value = value))

const { resize } = useAutoGrow(textarea, {
  minRows: () => props.minRows,
  maxRows: () => props.maxRows,
  source: draft,
})

async function commit(): Promise<void> {
  if (draft.value !== model.value) {
    const value = draft.value
    model.value = value
    emit('commit', value)
  }
  // The parent may normalise or reject the value; re-sync after it had the chance.
  await nextTick()
  draft.value = model.value
}

function onInput(event: Event): void {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  draft.value = event.target.value
  if (props.live) model.value = draft.value
  resize()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    void commit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    draft.value = model.value
    emit('cancel')
    textarea.value?.blur()
  }
}

const shell = cva({
  base: {
    display: 'block',
    w: 'full',
    minW: '0',
    px: '2',
    py: '1.5',
    borderRadius: 'sm',
    bg: 'bg.input',
    color: 'fg.default',
    textStyle: 'ui.sm',
    borderWidth: '1px',
    borderColor: 'transparent',
    resize: 'none',
    outline: 'none',
    userSelect: 'text',
    transitionProperty: 'border-color',
    transitionDuration: 'fast',
    scrollbarWidth: 'thin',
    _placeholder: { color: 'fg.subtle' },
    _hover: { borderColor: 'border.default' },
    _focusVisible: { outline: 'none' },
    _focus: { borderColor: 'accent.default', _hover: { borderColor: 'accent.default' } },
    _disabled: { opacity: 0.4, pointerEvents: 'none' },
  },
  variants: {
    mono: { true: { fontFamily: 'mono' } },
    invalid: { true: { borderColor: 'danger.default', _hover: { borderColor: 'danger.default' } } },
  },
})

defineExpose({ focus: () => textarea.value?.focus(), textarea })
</script>

<template>
  <textarea
    ref="textarea"
    v-bind="fieldAttrs"
    :class="[shell({ mono, invalid }), $attrs.class]"
    :style="$attrs.style"
    :value="draft"
    :rows="minRows"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :aria-label="ariaLabel"
    :aria-invalid="invalid || undefined"
    spellcheck="false"
    @input="onInput"
    @keydown="onKeydown"
    @blur="commit"
  />
</template>
