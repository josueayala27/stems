<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed, ref, watch } from 'vue'
import Badge from './Badge.vue'
import Button from './Button.vue'
import Input from './Input.vue'
import { enumOptions, type JsonSchema, type SchemaFieldKind } from './lib/jsonSchema'
import NumberField from './NumberField.vue'
import Select from './Select.vue'
import Switch from './Switch.vue'
import Textarea from './Textarea.vue'

/**
 * The built-in control for one leaf field of a SchemaForm. Strings that end up
 * empty are written as `undefined`, so optional keys disappear from the value.
 */
const props = defineProps<{
  schema: JsonSchema
  kind: SchemaFieldKind
  value: unknown
  id: string
  label: string
  required: boolean
  invalid: boolean
  disabled: boolean
  /** Secret fields only: a value is already stored server-side. */
  stored: boolean
}>()

const emit = defineEmits<{ update: [value: unknown]; touch: [] }>()

const placeholder = computed(() => props.schema['x-placeholder'] ?? (props.schema.default !== undefined ? String(props.schema.default) : undefined))

const inputType = computed(() => {
  if (props.schema.format === 'email') return 'email'
  if (props.schema.format === 'uri' || props.schema.format === 'url') return 'url'
  return 'text'
})

const text = computed(() => (typeof props.value === 'string' ? props.value : ''))

function updateText(value: string): void {
  emit('update', value === '' ? undefined : value)
}

// Enum values may be numbers, booleans or null, so the Select works on option indexes.
const options = computed(() => {
  const list = enumOptions(props.schema).map((option, index) => ({ value: String(index), label: option.label }))
  return props.required ? list : [{ value: '', label: '—' }, ...list]
})
const enumIndex = computed(() => {
  const index = enumOptions(props.schema).findIndex((o) => o.value === props.value)
  return index >= 0 ? String(index) : ''
})
function updateEnum(index: string | undefined): void {
  emit('update', index === undefined || index === '' ? undefined : enumOptions(props.schema)[Number(index)]?.value)
  emit('touch')
}

const numberText = computed(() => (typeof props.value === 'number' ? String(props.value) : ''))
function updateNumber(value: string): void {
  const parsed = Number.parseFloat(value)
  emit('update', value.trim() === '' || Number.isNaN(parsed) ? undefined : parsed)
}

function updateBoolean(value: boolean): void {
  emit('update', value)
  emit('touch')
}

// Secret: `undefined` keeps what is stored, a string replaces it, `null` clears it.
const secretMode = computed<'idle' | 'editing' | 'clearing'>(() => {
  if (typeof props.value === 'string') return 'editing'
  if (props.value === null) return 'clearing'
  return 'idle'
})
function startSecret(): void {
  emit('update', '')
}
function cancelSecret(): void {
  emit('update', undefined)
}
function clearSecret(): void {
  emit('update', null)
  emit('touch')
}

// JSON fallback for shapes the form has no control for.
const jsonText = ref('')
const jsonError = ref(false)
watch(
  () => props.value,
  (value) => {
    jsonText.value = value === undefined ? '' : JSON.stringify(value, null, 2)
    jsonError.value = false
  },
  { immediate: true },
)
function commitJson(source: string): void {
  if (source.trim() === '') {
    jsonError.value = false
    emit('update', undefined)
    return
  }
  try {
    emit('update', JSON.parse(source) as unknown)
    jsonError.value = false
  } catch {
    jsonError.value = true
  }
}

const secretRow = css({ display: 'flex', alignItems: 'center', gap: '1.5', minH: 'control.md' })
const secretInput = css({ flex: '1', minW: '0' })
const switchRow = css({ display: 'flex', alignItems: 'center', minH: 'control.md' })
const hint = css({ textStyle: 'ui.xs', color: 'danger.default' })
</script>

<template>
  <Textarea
    v-if="kind === 'string' && schema['x-multiline']"
    :id="id"
    :model-value="text"
    :placeholder="placeholder"
    :disabled="disabled || schema.readOnly"
    :invalid="invalid"
    :aria-label="label"
    :aria-required="required || undefined"
    @update:model-value="updateText"
  />
  <Input
    v-else-if="kind === 'string'"
    :id="id"
    :model-value="text"
    :type="inputType"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="schema.readOnly"
    :invalid="invalid"
    :aria-label="label"
    :aria-required="required || undefined"
    @update:model-value="updateText"
  />
  <Select
    v-else-if="kind === 'enum'"
    :id="id"
    :model-value="enumIndex"
    :options="options"
    :disabled="disabled || schema.readOnly"
    :aria-label="label"
    @update:model-value="updateEnum"
  />
  <NumberField
    v-else-if="kind === 'number' || kind === 'integer'"
    :id="id"
    :model-value="numberText"
    :units="['']"
    :min="schema.minimum"
    :max="schema.maximum"
    :step="kind === 'integer' ? 1 : (schema.multipleOf ?? 1)"
    :decimals="kind === 'integer' ? 0 : 4"
    :scrub="false"
    :placeholder="placeholder"
    :disabled="disabled || schema.readOnly"
    :aria-label="label"
    :aria-required="required || undefined"
    :aria-invalid="invalid || undefined"
    @update:model-value="updateNumber"
  />
  <div v-else-if="kind === 'boolean'" :class="switchRow">
    <Switch :id="id" :model-value="value === true" :disabled="disabled || schema.readOnly" :aria-label="label" @update:model-value="updateBoolean" />
  </div>
  <div v-else-if="kind === 'secret'" :class="secretRow" data-part="secret" :data-mode="secretMode">
    <template v-if="secretMode === 'editing'">
      <Input
        :id="id"
        :class="secretInput"
        :model-value="text"
        type="password"
        live
        autocomplete="new-password"
        placeholder="Enter a new value"
        :disabled="disabled"
        :invalid="invalid"
        :aria-label="label"
        :aria-required="required || undefined"
        @update:model-value="(v: string) => emit('update', v)"
      />
      <Button size="sm" variant="ghost" :disabled="disabled" @click="cancelSecret">Cancel</Button>
    </template>
    <template v-else-if="secretMode === 'clearing'">
      <Badge tone="warning" label="Will be cleared" />
      <Button size="sm" variant="ghost" :disabled="disabled" @click="cancelSecret">Undo</Button>
    </template>
    <template v-else-if="stored">
      <Badge tone="success" dot label="Saved" />
      <Button :id="id" size="sm" :disabled="disabled" @click="startSecret">Replace</Button>
      <Button size="sm" variant="ghost" :disabled="disabled" @click="clearSecret">Clear</Button>
    </template>
    <template v-else>
      <Badge tone="neutral" label="Not set" />
      <Button :id="id" size="sm" :disabled="disabled" @click="startSecret">Set</Button>
    </template>
  </div>
  <div v-else>
    <Textarea
      :id="id"
      v-model="jsonText"
      mono
      :min-rows="3"
      :disabled="disabled || schema.readOnly"
      :invalid="invalid || jsonError"
      :aria-label="`${label} (JSON)`"
      @commit="commitJson"
    />
    <div v-if="jsonError" :class="hint" role="alert">Invalid JSON</div>
  </div>
</template>
