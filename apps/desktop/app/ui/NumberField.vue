<script setup lang="ts">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { computed, ref } from 'vue'
import { useScrub } from './composables/useScrub'
import Input from './Input.vue'
import { clamp, formatNumber } from './lib/number'
import { nudge } from './lib/scrub'
import { cssToDimension, formatDimension, parseDimension, type Dimension, type Unit } from './lib/units'
import type { ControlSize } from './types'

/**
 * Value model: a CSS string, the same shape the document stores
 * (`'12px'`, `'50%'`, `'auto'`, `'0.9'` for unitless, `''` for unset).
 * Use `parseDimension` / `formatDimension` from the kit to convert.
 */
const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** Accepted units; the first numeric one is the default. `['']` makes a unitless field. */
    units?: Unit[]
    min?: number
    max?: number
    step?: number
    /** Decimal places shown and stored. */
    decimals?: number
    /** Short text on the left that doubles as the scrub handle (e.g. `W`, `X`). */
    label?: string
    /** Lucide icon on the left; also a scrub handle. */
    icon?: string
    /** Drag the label/icon to change the value. */
    scrub?: boolean
    /** Use the Pointer Lock API while scrubbing (infinite travel, hidden cursor). */
    pointerLock?: boolean
    /** Pointer travel in px per step while scrubbing. */
    pixelsPerStep?: number
    /** The selection holds different values; shows a "Mixed" placeholder. */
    mixed?: boolean
    placeholder?: string
    disabled?: boolean
    size?: ControlSize
    ariaLabel?: string
  }>(),
  {
    units: () => ['px'],
    min: undefined,
    max: undefined,
    step: 1,
    decimals: 2,
    label: undefined,
    icon: undefined,
    scrub: true,
    pointerLock: false,
    pixelsPerStep: 1,
    mixed: false,
    placeholder: undefined,
    disabled: false,
    size: 'md',
    ariaLabel: undefined,
  },
)

const emit = defineEmits<{
  /** A drag began; group the following updates into one undo step. */
  scrubStart: []
  scrubEnd: []
  /** Typed value committed (Enter/blur) or keyboard nudge. */
  commit: [value: string]
}>()

const field = ref<InstanceType<typeof Input> | null>(null)

const defaultUnit = computed<Unit>(() => props.units.find((u) => u !== 'auto') ?? '')
const current = computed<Dimension | null>(() => (props.mixed ? null : cssToDimension(model.value, defaultUnit.value)))
/** Unit used for numeric edits; `auto` falls back to the default unit. */
const numericUnit = computed<Unit>(() => {
  const unit = current.value?.unit
  return unit && unit !== 'auto' && props.units.includes(unit) ? unit : defaultUnit.value
})
const numericValue = computed(() => current.value?.value ?? clamp(0, props.min, props.max))

const text = computed(() => {
  const dim = current.value
  if (!dim) return ''
  if (dim.unit === 'auto') return 'Auto'
  return dim.value === null ? '' : formatNumber(dim.value, props.decimals)
})

const suffix = computed(() => {
  const unit = current.value?.unit
  // px is implied (Framer convention); every other unit is shown.
  if (!unit || unit === 'auto' || unit === 'px') return ''
  return unit
})

function emitValue(dim: Dimension, commit: boolean): void {
  const value = formatDimension(dim, props.decimals)
  if (value === model.value) return
  model.value = value
  if (commit) emit('commit', value)
}

function onCommit(raw: string): void {
  const parsed = parseDimension(raw, { units: props.units, fallbackUnit: numericUnit.value })
  if (!parsed) return
  emitValue(parsed.value === null ? parsed : { ...parsed, value: clamp(parsed.value, props.min, props.max) }, true)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  const value = nudge(numericValue.value, event.key === 'ArrowUp' ? 1 : -1, { shift: event.shiftKey, alt: event.altKey }, props)
  emitValue({ value, unit: numericUnit.value }, true)
}

const { scrubbing, onPointerDown } = useScrub({
  getValue: () => numericValue.value,
  config: () => ({ step: props.step, pixelsPerStep: props.pixelsPerStep, min: props.min, max: props.max }),
  onChange: (value) => emitValue({ value, unit: numericUnit.value }, false),
  onStart: () => emit('scrubStart'),
  onEnd: () => emit('scrubEnd'),
  onClick: () => field.value?.focus(),
  pointerLock: () => props.pointerLock,
})

const canScrub = computed(() => props.scrub && !props.disabled && Boolean(props.label || props.icon))

const handle = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minW: '3.5',
    h: 'full',
    color: 'fg.subtle',
    textStyle: 'ui.xs',
    userSelect: 'none',
    transitionProperty: 'color',
    transitionDuration: 'fast',
  },
  variants: {
    scrub: { true: { cursor: 'ew-resize', _hover: { color: 'fg.default' } } },
    active: { true: { color: 'accent.default' } },
  },
})

const unitClass = css({ textStyle: 'ui.xs', color: 'fg.subtle' })

defineExpose({ focus: () => field.value?.focus() })
</script>

<template>
  <Input
    ref="field"
    :model-value="text"
    :size="size"
    :disabled="disabled"
    :placeholder="mixed ? 'Mixed' : placeholder"
    :aria-label="ariaLabel ?? label"
    inputmode="decimal"
    @update:model-value="() => {}"
    @commit="onCommit"
    @keydown="onKeydown"
  >
    <template v-if="label || icon" #prefix>
      <span
        :class="handle({ scrub: canScrub, active: scrubbing })"
        :aria-hidden="true"
        @pointerdown="canScrub && onPointerDown($event)"
      >
        <Icon v-if="icon" :name="icon" :size="12" />
        <template v-else>{{ label }}</template>
      </span>
    </template>
    <template v-if="suffix" #suffix>
      <span :class="unitClass">{{ suffix }}</span>
    </template>
  </Input>
</template>
