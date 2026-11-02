<script setup lang="ts">
import { css } from 'styled-system/css'
import { computed, provide, ref, toRef, useId, useSlots, watch, type Slot } from 'vue'
import { setAtPath, type PathSegment } from './lib/jsonPath'
import { fieldKind, resolveSchema, validateSchema, type JsonSchema, type SchemaIssue } from './lib/jsonSchema'
import { SCHEMA_FORM, type SchemaFieldSlotProps } from './lib/schemaFormContext'
import SchemaField from './SchemaField.vue'

/**
 * A form generated from a JSON Schema subset (see `lib/jsonSchema.ts`).
 * `v-model` is the JSON value. Any leaf field's control can be replaced through
 * the `field:<path>` slot (one field) or the `field` slot (every leaf); both get
 * `Default`, the built-in control, to wrap or fall back to.
 *
 * Secret fields (`x-secret: true`) never show a stored value: their entry in the
 * model is `undefined` (keep), a string (replace) or `null` (clear).
 */
const props = withDefaults(
  defineProps<{
    schema: JsonSchema
    /** Formatted paths of secret fields that already hold a value server-side. */
    storedSecrets?: string[]
    /** Extra messages by formatted path (e.g. from the server); shown regardless of touch state. */
    errors?: Record<string, string>
    /** Show every validation message now, not only for visited fields. */
    showErrors?: boolean
    disabled?: boolean
  }>(),
  { storedSecrets: () => [], errors: () => ({}), showErrors: false, disabled: false },
)

const model = defineModel<unknown>()

const emit = defineEmits<{
  /** Current validation issues, emitted on every change of value or schema. */
  issues: [issues: SchemaIssue[]]
}>()

defineSlots<{ field?: (props: SchemaFieldSlotProps) => unknown } & Record<`field:${string}`, (props: SchemaFieldSlotProps) => unknown>>()
const slots = useSlots() as Record<string, Slot | undefined>

const storedSet = computed<ReadonlySet<string>>(() => new Set(props.storedSecrets))
const touched = ref(new Set<string>())
const revealAll = ref(false)

const rootIsObject = computed(() => fieldKind(resolveSchema(props.schema).schema) === 'object')
const issues = computed(() =>
  validateSchema(props.schema, model.value === undefined && rootIsObject.value ? {} : model.value, { storedSecrets: storedSet.value }),
)
const issueByPath = computed(() => {
  const map = new Map<string, string>()
  for (const issue of issues.value) if (!map.has(issue.path)) map.set(issue.path, issue.message)
  return map
})

watch(issues, (list) => emit('issues', list), { immediate: true })

function errorFor(path: string): string | undefined {
  const external = props.errors[path]
  if (external) return external
  if (!props.showErrors && !revealAll.value && !touched.value.has(path)) return undefined
  return issueByPath.value.get(path)
}

function touch(path: string): void {
  if (touched.value.has(path)) return
  touched.value = new Set(touched.value).add(path)
}

function update(segments: PathSegment[], value: unknown): void {
  model.value = setAtPath(model.value, segments, value)
}

provide(SCHEMA_FORM, {
  update,
  touch,
  errorFor,
  storedSecrets: storedSet,
  disabled: toRef(props, 'disabled'),
  idPrefix: `sf${useId()}`,
  slots,
})

/** Reveals every message and returns the issues (empty when the value is valid). */
function validate(): SchemaIssue[] {
  revealAll.value = true
  return issues.value
}

/** Hides messages again, e.g. after the form was saved or reset. */
function resetValidation(): void {
  revealAll.value = false
  touched.value = new Set()
}

defineExpose({ validate, resetValidation, issues })

const root = css({ display: 'flex', flexDirection: 'column', gap: '3', minW: '0' })
</script>

<template>
  <div :class="root" data-part="schema-form">
    <SchemaField :schema="schema" :segments="[]" :name="null" :value="model" />
  </div>
</template>
