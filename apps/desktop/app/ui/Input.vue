<script setup lang="ts">
import { cva } from 'styled-system/css'
import { computed, nextTick, ref, useAttrs, watch } from 'vue'
import type { ControlSize } from './types'

// class/style size the shell; every other attr and listener targets the native input.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    size?: ControlSize
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    /** Update the model on every keystroke instead of on commit. */
    live?: boolean
    selectOnFocus?: boolean
    align?: 'left' | 'right'
    mono?: boolean
    invalid?: boolean
    ariaLabel?: string
    type?: 'text' | 'search' | 'url' | 'email' | 'password' | 'tel'
    /** Native autocomplete hint; `off` by default, use e.g. `current-password` or `email` for auth forms. */
    autocomplete?: string
  }>(),
  {
    size: 'md',
    placeholder: undefined,
    disabled: false,
    readonly: false,
    live: false,
    selectOnFocus: true,
    align: 'left',
    mono: false,
    invalid: false,
    ariaLabel: undefined,
    type: 'text',
    autocomplete: 'off',
  },
)

const model = defineModel<string>({ default: '' })

const emit = defineEmits<{
  /** Enter or blur with a changed value. */
  commit: [value: string]
  /** Escape: the draft was reverted. */
  cancel: []
}>()

defineSlots<{ prefix?: () => unknown; suffix?: () => unknown }>()

const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const input = ref<HTMLInputElement | null>(null)
const draft = ref(model.value)

watch(model, (value) => (draft.value = value))

/** Value at focus or at the last commit: `live` inputs keep the model in step while typing. */
let committed = model.value

async function commit(): Promise<void> {
  if (draft.value !== model.value || (props.live && draft.value !== committed)) {
    const value = draft.value
    model.value = value
    emit('commit', value)
  }
  // The parent may normalise or reject the value; re-sync after it had the chance.
  await nextTick()
  draft.value = model.value
  committed = model.value
}

function onInput(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  draft.value = event.target.value
  if (props.live) model.value = draft.value
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    void commit().then(() => input.value?.select())
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    draft.value = model.value
    emit('cancel')
    input.value?.blur()
  }
}

function onFocus(): void {
  committed = model.value
  if (props.selectOnFocus) input.value?.select()
}

const shell = cva({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '1',
    w: 'full',
    minW: '0',
    px: '2',
    borderRadius: 'sm',
    bg: 'bg.input',
    color: 'fg.default',
    borderWidth: '1px',
    borderColor: 'transparent',
    cursor: 'text',
    transitionProperty: 'border-color',
    transitionDuration: 'fast',
    _hover: { borderColor: 'border.default' },
    _focusWithin: { borderColor: 'accent.default', _hover: { borderColor: 'accent.default' } },
    '& input': {
      flex: '1',
      minW: '0',
      h: 'full',
      bg: 'transparent',
      color: 'inherit',
      outline: 'none',
      userSelect: 'text',
      _placeholder: { color: 'fg.subtle' },
      _focusVisible: { outline: 'none' },
    },
    '& [data-part=adornment]': { display: 'inline-flex', alignItems: 'center', color: 'fg.subtle', flexShrink: 0 },
  },
  variants: {
    size: {
      sm: { h: 'control.sm', textStyle: 'ui.xs' },
      md: { h: 'control.md', textStyle: 'ui.sm' },
    },
    align: { left: {}, right: { '& input': { textAlign: 'right' } } },
    mono: { true: { '& input': { fontFamily: 'mono' } } },
    invalid: { true: { borderColor: 'danger.default', _hover: { borderColor: 'danger.default' } } },
    disabled: { true: { opacity: 0.4, pointerEvents: 'none' } },
  },
})

defineExpose({
  focus: () => input.value?.focus(),
  select: () => input.value?.select(),
  input,
})
</script>

<template>
  <label :class="[shell({ size, align, mono, invalid, disabled }), $attrs.class]" :style="$attrs.style">
    <span v-if="$slots.prefix" data-part="adornment"><slot name="prefix" /></span>
    <input
      ref="input"
      v-bind="inputAttrs"
      :type="type"
      :value="draft"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :aria-label="ariaLabel"
      :aria-invalid="invalid || undefined"
      spellcheck="false"
      :autocomplete="autocomplete"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="commit"
    />
    <span v-if="$slots.suffix" data-part="adornment"><slot name="suffix" /></span>
  </label>
</template>
