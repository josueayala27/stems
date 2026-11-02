<script setup lang="ts">
import { Icon } from '#components'
import { css } from 'styled-system/css'
import { computed, ref, watch } from 'vue'
import ColorPicker from './ColorPicker.vue'
import type { Placement } from './composables/useFloatingSurface'
import IconButton from './IconButton.vue'
import Input from './Input.vue'
import { parseColor, rgbaToHex, tokenLabel, type Rgba } from './lib/color'
import NumberField from './NumberField.vue'
import Popover from './Popover.vue'
import Swatch from './Swatch.vue'
import ColorTokenPalette from './ColorTokenPalette.vue'
import { colorTokenVar, type ColorToken, type ControlSize } from './types'

/**
 * Value model: any CSS colour string. Solid colours are emitted as `#rrggbb` /
 * `#rrggbbaa`; `var(--token)` values are shown as a token chip until detached.
 */
const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    mixed?: boolean
    disabled?: boolean
    size?: ControlSize
    pickerPlacement?: Placement
    /** Site colour tokens: shown as a palette in the picker, and used to display `var(--color-<key>)` values. */
    tokens?: ColorToken[]
    ariaLabel?: string
  }>(),
  { mixed: false, disabled: false, size: 'md', pickerPlacement: 'left-start', tokens: () => [], ariaLabel: 'Colour' },
)

const emit = defineEmits<{ scrubStart: []; scrubEnd: []; commit: [value: string] }>()

const open = ref(false)
const parsed = computed(() => (props.mixed ? null : parseColor(model.value)))
const token = computed(() => (parsed.value?.kind === 'var' ? parsed.value : null))
const matchedToken = computed(() => {
  const name = token.value?.name
  return name ? (props.tokens.find((t) => `--color-${t.key}` === name) ?? null) : null
})
const tokenName = computed(() => (matchedToken.value ? (matchedToken.value.name ?? matchedToken.value.key) : token.value ? tokenLabel(token.value.name) : ''))
const swatchColor = computed(() => matchedToken.value?.value ?? model.value)
const rgba = computed<Rgba | null>(() => (parsed.value?.kind === 'rgba' ? parsed.value.rgba : null))

const isCurrentColor = (value: string) => /^currentcolor$/i.test(value.trim())
const hexText = computed(() =>
  rgba.value ? rgbaToHex({ ...rgba.value, a: 1 }).slice(1).toUpperCase() : !props.mixed && isCurrentColor(model.value) ? 'currentColor' : '',
)
/** Last rejected entry: shown as an error under the field until the next valid one or a new value. */
const rejected = ref<string | null>(null)
watch(model, () => (rejected.value = null))
const alphaText = computed(() => (rgba.value ? `${Math.round(rgba.value.a * 100)}%` : ''))
const pickerValue = computed(() => (rgba.value ? rgbaToHex(rgba.value) : resolveToken() ?? '#000000'))

function set(value: string): void {
  if (value === model.value) return
  model.value = value
  emit('commit', value)
}

function setLive(value: string): void {
  if (value !== model.value) model.value = value
}

/** Hex (3/4/6/8 digits, `#` optional), `rgb[a]()`, `hsl[a]()`, named colours, `transparent`, `currentColor`, `var()`. */
function onHexCommit(text: string): void {
  const trimmed = text.trim()
  if (trimmed === '') return
  if (isCurrentColor(trimmed)) {
    rejected.value = null
    return set('currentColor')
  }
  const next = parseColor(/^[0-9a-f]{3,8}$/i.test(trimmed) ? `#${trimmed}` : trimmed)
  if (!next) {
    rejected.value = trimmed
    return
  }
  rejected.value = null
  if (next.kind === 'var') return set(trimmed)
  // Typing a 6-digit hex keeps the current opacity.
  const keepAlpha = /^#?[0-9a-f]{6}$/i.test(trimmed)
  set(rgbaToHex(keepAlpha ? { ...next.rgba, a: rgba.value?.a ?? 1 } : next.rgba))
}

function onAlphaCommit(text: string): void {
  const value = parseFloat(text)
  if (!Number.isFinite(value)) return
  set(rgbaToHex({ ...(rgba.value ?? { r: 0, g: 0, b: 0, a: 1 }), a: Math.min(1, Math.max(0, value / 100)) }))
}

/** Current computed value of the token in this document, if defined. */
function resolveToken(): string | null {
  const current = token.value
  if (!current) return null
  const known = matchedToken.value ? parseColor(matchedToken.value.value) : null
  if (known?.kind === 'rgba') return rgbaToHex(known.rgba)
  if (typeof document === 'undefined') return null
  const raw = getComputedStyle(document.documentElement).getPropertyValue(current.name).trim()
  const resolved = raw ? parseColor(raw) : null
  const value = resolved?.kind === 'rgba' ? resolved.rgba : current.fallback
  return value ? rgbaToHex(value) : null
}

function pickToken(t: ColorToken, close: () => void): void {
  set(colorTokenVar(t.key))
  close()
}

function detach(): void {
  set(resolveToken() ?? '#000000')
}

const root = css({ display: 'grid', gridTemplateColumns: '1fr token(sizes.14)', gap: '1.5', w: 'full', minW: '0' })
const swatchButton = css({
  display: 'inline-grid',
  placeItems: 'center',
  borderRadius: 'xs',
  cursor: 'pointer',
  _focusVisible: { outlineOffset: '[1px]' },
})
const chip = css({
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  gap: '1.5',
  h: 'control.md',
  pl: '2',
  pr: '0.5',
  borderRadius: 'sm',
  bg: 'accent.muted',
  color: 'fg.default',
  textStyle: 'ui.sm',
  minW: '0',
})
const chipLabel = css({ flex: '1', minW: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const chipIcon = css({ color: 'accent.hover', flexShrink: 0 })
const error = css({ gridColumn: '1 / -1', textStyle: 'ui.xs', color: 'danger.default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
</script>

<template>
  <div :class="root">
    <div v-if="token" :class="chip">
      <Popover v-model:open="open" :placement="pickerPlacement" ariaLabel="Colour picker">
        <template #trigger="{ props: trigger }">
          <button type="button" :class="swatchButton" :aria-label="`Edit ${tokenName}`" :disabled="disabled" v-bind="trigger">
            <Swatch :color="swatchColor" />
          </button>
        </template>
        <template #default="{ close }">
          <ColorPicker :model-value="pickerValue" @update:model-value="setLive" @scrub-start="emit('scrubStart')" @scrub-end="emit('scrubEnd')" />
          <ColorTokenPalette :tokens="tokens" :selected="matchedToken?.key" @pick="(t) => pickToken(t, close)" />
        </template>
      </Popover>
      <Icon name="lucide:hexagon" :size="12" :class="chipIcon" aria-hidden="true" />
      <span :class="chipLabel">{{ tokenName }}</span>
      <IconButton icon="lucide:unlink" label="Detach token" size="sm" :disabled="disabled" @click="detach" />
    </div>
    <template v-else>
      <!-- Controlled (no-op update): a rejected entry snaps back to the stored value; the error says why. -->
      <Input
        :model-value="hexText"
        :size="size"
        :disabled="disabled"
        :placeholder="mixed ? 'Mixed' : undefined"
        :aria-label="ariaLabel"
        :invalid="rejected !== null"
        @update:model-value="() => {}"
        @commit="onHexCommit"
      >
        <template #prefix>
          <Popover v-model:open="open" :placement="pickerPlacement" ariaLabel="Colour picker">
            <template #trigger="{ props: trigger }">
              <button type="button" :class="swatchButton" aria-label="Open colour picker" :disabled="disabled" v-bind="trigger" @click.prevent>
                <Swatch :color="mixed ? 'transparent' : model || 'transparent'" />
              </button>
            </template>
            <template #default="{ close }">
              <ColorPicker
                :model-value="pickerValue"
                @update:model-value="setLive"
                @scrub-start="emit('scrubStart')"
                @scrub-end="emit('scrubEnd')"
              />
              <ColorTokenPalette :tokens="tokens" @pick="(t) => pickToken(t, close)" />
            </template>
          </Popover>
        </template>
      </Input>
      <NumberField
        :model-value="alphaText"
        :units="['%']"
        :min="0"
        :max="100"
        :decimals="0"
        :size="size"
        :disabled="disabled || !rgba"
        :mixed="mixed"
        aria-label="Opacity"
        @commit="onAlphaCommit"
      />
      <p v-if="rejected !== null" :class="error" role="alert" :title="rejected">Not a colour: {{ rejected }}</p>
    </template>
  </div>
</template>
