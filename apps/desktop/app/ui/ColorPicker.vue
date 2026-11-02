<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed, ref, watch } from 'vue'
import ColorArea from './ColorArea.vue'
import ColorSlider from './ColorSlider.vue'
import Input from './Input.vue'
import NumberField from './NumberField.vue'
import { hsvaToRgba, parseColor, rgbaEqual, rgbaToHex, rgbaToHsva, type Hsva } from './lib/color'
import { roundTo } from './lib/number'

/** CSS colour string; emits `#rrggbb` or `#rrggbbaa`. */
const model = defineModel<string>({ default: '#000000' })
const emit = defineEmits<{ scrubStart: []; scrubEnd: [] }>()

// HSV is the source of truth while editing so hue survives greys and black.
const hsva = ref<Hsva>({ h: 0, s: 0, v: 0, a: 1 })

watch(
  model,
  (value) => {
    const parsed = parseColor(value)
    const rgba = parsed?.kind === 'rgba' ? parsed.rgba : parsed?.fallback
    if (!rgba || rgbaEqual(hsvaToRgba(hsva.value), rgba)) return
    const next = rgbaToHsva(rgba)
    hsva.value = next.s === 0 || next.v === 0 ? { ...next, h: hsva.value.h } : next
  },
  { immediate: true },
)

function update(patch: Partial<Hsva>): void {
  hsva.value = { ...hsva.value, ...patch }
  model.value = rgbaToHex(hsvaToRgba(hsva.value))
}

const saturation = computed({ get: () => hsva.value.s, set: (s) => update({ s }) })
const brightness = computed({ get: () => hsva.value.v, set: (v) => update({ v }) })
const hue = computed({ get: () => hsva.value.h / 360, set: (h) => update({ h: h * 360 }) })
const alpha = computed({ get: () => hsva.value.a, set: (a) => update({ a: roundTo(a, 2) }) })

const opaqueHex = computed(() => rgbaToHex({ ...hsvaToRgba(hsva.value), a: 1 }))
const hexText = computed(() => opaqueHex.value.slice(1).toUpperCase())
const alphaText = computed(() => `${Math.round(hsva.value.a * 100)}%`)
const hueGradient = 'linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)'
const alphaGradient = computed(() => `linear-gradient(to right, transparent, ${opaqueHex.value})`)

function onHexCommit(text: string): void {
  const parsed = parseColor(text.startsWith('#') || text.includes('(') ? text : `#${text}`)
  if (parsed?.kind !== 'rgba') return
  const next = rgbaToHsva(parsed.rgba)
  // A 6-digit hex keeps the current alpha.
  update(/^#?[0-9a-f]{6}$/i.test(text.trim()) ? { ...next, a: hsva.value.a } : next)
}

function onAlphaCommit(text: string): void {
  const value = parseFloat(text)
  if (Number.isFinite(value)) update({ a: roundTo(value / 100, 2) })
}

const root = css({ display: 'flex', flexDirection: 'column', gap: '3', w: '56', p: '1' })
const row = css({ display: 'grid', gridTemplateColumns: '1fr token(sizes.16)', gap: '1.5' })
</script>

<template>
  <div :class="root">
    <ColorArea
      v-model:saturation="saturation"
      v-model:brightness="brightness"
      :hue="hsva.h"
      @scrub-start="emit('scrubStart')"
      @scrub-end="emit('scrubEnd')"
    />
    <ColorSlider v-model="hue" label="Hue" :background="hueGradient" @scrub-start="emit('scrubStart')" @scrub-end="emit('scrubEnd')" />
    <ColorSlider
      v-model="alpha"
      label="Opacity"
      checkered
      :background="alphaGradient"
      :value-text="alphaText"
      @scrub-start="emit('scrubStart')"
      @scrub-end="emit('scrubEnd')"
    />
    <div :class="row">
      <Input :model-value="hexText" aria-label="Hex colour" @commit="onHexCommit">
        <template #prefix>#</template>
      </Input>
      <NumberField :model-value="alphaText" :units="['%']" :min="0" :max="100" :decimals="0" aria-label="Opacity" @commit="onAlphaCommit" />
    </div>
  </div>
</template>
