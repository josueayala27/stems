<script setup lang="ts">
import { css, cva } from 'styled-system/css'
import { computed, defineComponent, h, inject, type Slot } from 'vue'
import Button from './Button.vue'
import IconButton from './IconButton.vue'
import { formatPath, moveItem, type PathSegment } from './lib/jsonPath'
import { emptyValue, fieldKind, fieldLabel, resolveSchema, type JsonSchema } from './lib/jsonSchema'
import { SCHEMA_FORM, type SchemaFieldSlotProps } from './lib/schemaFormContext'
import { matchesShortcut } from './lib/shortcut'
import SchemaControl from './SchemaControl.vue'

defineOptions({ name: 'SchemaField' })

const props = withDefaults(
  defineProps<{
    schema: JsonSchema
    segments: PathSegment[]
    /** Property name or array index; `null` for the root. */
    name: PathSegment | null
    required?: boolean
    /** Array items of primitives: the label is only announced, not shown. */
    hideLabel?: boolean
    value: unknown
  }>(),
  { required: false, hideLabel: false },
)

const form = inject(SCHEMA_FORM)
if (!form) throw new Error('SchemaField must be rendered inside SchemaForm')
const ctx = form

const resolved = computed(() => resolveSchema(props.schema).schema)
const kind = computed(() => fieldKind(resolved.value))
const path = computed(() => formatPath(props.segments))
const id = computed(() => `${ctx.idPrefix}-${path.value === '' ? 'root' : path.value.replace(/[^\w-]/g, '_')}`)
const label = computed(() => fieldLabel(resolved.value, props.name))
const error = computed(() => ctx.errorFor(path.value))
const isRoot = computed(() => props.segments.length === 0)

function update(value: unknown): void {
  ctx.update(props.segments, value)
}
function touch(): void {
  ctx.touch(path.value)
}

// Stable component so a slot can render the built-in control without remounting it.
const Default = defineComponent({
  name: 'SchemaDefaultControl',
  setup: () => () =>
    h(SchemaControl, {
      schema: resolved.value,
      kind: kind.value,
      value: props.value,
      id: id.value,
      label: label.value,
      required: props.required,
      invalid: error.value !== undefined,
      disabled: ctx.disabled.value,
      stored: ctx.storedSecrets.value.has(path.value),
      onUpdate: update,
      onTouch: touch,
    }),
})

// Looked up at render time: compiled slot functions change identity when the caller re-renders.
function findSlot(): Slot | undefined {
  return ctx.slots[`field:${path.value}`] ?? ctx.slots.field
}

const slotProps = computed<SchemaFieldSlotProps>(() => ({
  path: path.value,
  segments: props.segments,
  schema: resolved.value,
  kind: kind.value,
  value: props.value,
  update,
  touch,
  id: id.value,
  label: label.value,
  required: props.required,
  invalid: error.value !== undefined,
  error: error.value,
  disabled: ctx.disabled.value,
  Default,
}))

// Stable renderer for the caller's slot (a new inline component each render would remount it).
const SlotOutlet = defineComponent({
  name: 'SchemaFieldSlot',
  setup: () => () => findSlot()?.(slotProps.value),
})

const record = computed<Record<string, unknown>>(() =>
  props.value !== null && typeof props.value === 'object' && !Array.isArray(props.value) ? (props.value as Record<string, unknown>) : {},
)
const requiredKeys = computed(() => new Set(resolved.value.required ?? []))

const list = computed<unknown[]>(() => (Array.isArray(props.value) ? props.value : []))
const itemSchema = computed<JsonSchema>(() => resolved.value.items ?? {})
const itemIsGroup = computed(() => {
  const k = fieldKind(resolveSchema(itemSchema.value).schema)
  return k === 'object' || k === 'array'
})
const canAdd = computed(() => resolved.value.maxItems === undefined || list.value.length < resolved.value.maxItems)

function addItem(): void {
  update([...list.value, emptyValue(itemSchema.value)])
  touch()
}
function removeItem(index: number): void {
  update(list.value.filter((_, i) => i !== index))
  touch()
}
function moveTo(index: number, to: number): void {
  if (to < 0 || to >= list.value.length) return
  update(moveItem(list.value, index, to))
}
function onItemKeydown(event: KeyboardEvent, index: number): void {
  if (matchesShortcut(event, 'Alt+ArrowUp')) {
    event.preventDefault()
    moveTo(index, index - 1)
  } else if (matchesShortcut(event, 'Alt+ArrowDown')) {
    event.preventDefault()
    moveTo(index, index + 1)
  }
}

const field = css({ display: 'flex', flexDirection: 'column', gap: '1', minW: '0' })
const labelRow = css({ display: 'flex', alignItems: 'baseline', gap: '1', textStyle: 'ui.label', color: 'fg.muted' })
const requiredMark = css({ color: 'danger.default' })
const help = css({ textStyle: 'ui.xs', color: 'fg.subtle' })
const errorText = css({ textStyle: 'ui.xs', color: 'danger.default' })
const group = css({ minW: '0', m: '0', p: '0', borderWidth: '0' })
// The indent and guide line sit on the group's body, not the fieldset, so a nested group's legend
// lines up with the labels of its sibling fields (QA-UI-6).
const groupBody = cva({
  base: { display: 'flex', flexDirection: 'column', gap: '3', minW: '0' },
  variants: {
    nested: { true: { pl: '3', borderLeftWidth: '1px', borderColor: 'border.default' }, false: {} },
  },
})
const legend = css({ display: 'flex', alignItems: 'baseline', gap: '1', p: '0', mb: '2', textStyle: 'ui.label', color: 'fg.default' })
const items = css({ display: 'flex', flexDirection: 'column', gap: '2', listStyle: 'none', m: '0', p: '0' })
const item = css({ display: 'flex', alignItems: 'flex-start', gap: '1', minW: '0' })
const itemBody = css({ flex: '1', minW: '0' })
const itemActions = css({ display: 'flex', gap: '0.5', flexShrink: 0, minH: 'control.md', alignItems: 'center' })
const addRow = css({ display: 'flex' })
</script>

<template>
  <fieldset v-if="kind === 'object'" :class="group" :data-path="path">
    <legend v-if="!isRoot && label" :class="legend">
      {{ label }}<span v-if="required" :class="requiredMark" aria-hidden="true">*</span>
    </legend>
    <div :class="groupBody({ nested: !isRoot })">
      <div v-if="!isRoot && resolved.description" :class="help">{{ resolved.description }}</div>
      <SchemaField
        v-for="(child, key) in resolved.properties"
        :key="key"
        :schema="child"
        :segments="[...segments, key]"
        :name="key"
        :required="requiredKeys.has(key)"
        :value="record[key]"
      />
    </div>
  </fieldset>

  <fieldset v-else-if="kind === 'array'" :class="group" :data-path="path" @focusout="touch">
    <legend v-if="label" :class="legend">
      {{ label }}<span v-if="required" :class="requiredMark" aria-hidden="true">*</span>
    </legend>
    <div :class="groupBody({ nested: !isRoot })">
      <div v-if="resolved.description" :class="help">{{ resolved.description }}</div>
      <ol v-if="list.length" :class="items">
        <li v-for="(entry, index) in list" :key="index" :class="item" :data-index="index" @keydown="onItemKeydown($event, index)">
          <div :class="itemBody">
            <SchemaField :schema="itemSchema" :segments="[...segments, index]" :name="index" :hide-label="!itemIsGroup" required :value="entry" />
          </div>
          <div :class="itemActions">
            <IconButton icon="lucide:arrow-up" :label="`Move item ${index + 1} up`" size="sm" :disabled="ctx.disabled.value || index === 0" @click="moveTo(index, index - 1)" />
            <IconButton
              icon="lucide:arrow-down"
              :label="`Move item ${index + 1} down`"
              size="sm"
              :disabled="ctx.disabled.value || index === list.length - 1"
              @click="moveTo(index, index + 1)"
            />
            <IconButton icon="lucide:x" :label="`Remove item ${index + 1}`" size="sm" :disabled="ctx.disabled.value" @click="removeItem(index)" />
          </div>
        </li>
      </ol>
      <div :class="addRow">
        <Button size="sm" variant="ghost" icon="lucide:plus" :disabled="ctx.disabled.value || !canAdd" @click="addItem">Add item</Button>
      </div>
      <div v-if="error" :id="`${id}-error`" :class="errorText" role="alert">{{ error }}</div>
    </div>
  </fieldset>

  <div v-else :class="field" :data-path="path" :data-kind="kind" @focusout="touch">
    <label v-if="label && !hideLabel" :for="id" :class="labelRow">
      {{ label }}<span v-if="required" :class="requiredMark" aria-hidden="true">*</span>
    </label>
    <SlotOutlet v-if="findSlot()" />
    <Default v-else />
    <div v-if="resolved.description" :class="help">{{ resolved.description }}</div>
    <div v-if="error" :id="`${id}-error`" :class="errorText" role="alert">{{ error }}</div>
  </div>
</template>
