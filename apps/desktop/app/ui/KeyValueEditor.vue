<script setup lang="ts" generic="V = string">
import { css } from 'styled-system/css'
import { computed, useId } from 'vue'
import Button from './Button.vue'
import IconButton from './IconButton.vue'
import Input from './Input.vue'
import { moveItem } from './lib/jsonPath'
import type { SortableMove } from './lib/sortable'
import SortableList from './SortableList.vue'
import type { KeyValuePair } from './types'

/**
 * Rows of key + value (headers, query params, variables). `v-model` is an array
 * of pairs, so order and duplicates are preserved; duplicate keys are flagged,
 * not rejected. The value control is the `value` slot (a text Input by default).
 */
const props = withDefaults(
  defineProps<{
    /** Value for a new row; required when `V` is not a string. */
    newValue?: () => V
    keyPlaceholder?: string
    valuePlaceholder?: string
    addLabel?: string
    reorderable?: boolean
    disabled?: boolean
    ariaLabel?: string
  }>(),
  { newValue: undefined, keyPlaceholder: 'Key', valuePlaceholder: 'Value', addLabel: 'Add row', reorderable: true, disabled: false, ariaLabel: 'Key-value pairs' },
)

const model = defineModel<KeyValuePair<V>[]>({ default: () => [] })

defineSlots<{
  value?: (props: { value: V; update: (value: V) => void; index: number; pairKey: string; disabled: boolean; ariaLabel: string }) => unknown
}>()

const listId = `kv${useId()}`

// Row ids live beside the model so rows keep identity across edits and moves.
let ids: string[] = []
let counter = 0
function nextId(): string {
  counter += 1
  return `${listId}-${counter}`
}
const rows = computed(() => {
  if (ids.length !== model.value.length) ids = model.value.map(() => nextId())
  return model.value.map((pair, index) => ({ id: ids[index]!, pair, index }))
})

const duplicates = computed(() => {
  const seen = new Map<string, number>()
  for (const { key } of model.value) {
    const k = key.trim()
    if (k !== '') seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k))
})

function isDuplicate(key: string): boolean {
  return duplicates.value.has(key.trim())
}

function setRow(index: number, patch: Partial<KeyValuePair<V>>): void {
  model.value = model.value.map((pair, i) => (i === index ? { ...pair, ...patch } : pair))
}

function add(): void {
  ids = [...ids, nextId()]
  const value = props.newValue ? props.newValue() : ('' as V)
  model.value = [...model.value, { key: '', value }]
}

function remove(index: number): void {
  ids = ids.filter((_, i) => i !== index)
  model.value = model.value.filter((_, i) => i !== index)
}

function onMove(move: SortableMove): void {
  ids = moveItem(ids, move.from.index, move.to.index)
  model.value = moveItem(model.value, move.from.index, move.to.index)
}

function rowLabel(key: string, index: number): string {
  return key.trim() === '' ? `Row ${index + 1}` : key
}

const root = css({ display: 'flex', flexDirection: 'column', gap: '1.5', minW: '0' })
const row = css({ display: 'grid', gridTemplateColumns: '[minmax(0, 2fr) minmax(0, 3fr) auto]', gap: '1', alignItems: 'start' })
const warning = css({ gridColumn: '[1 / -1]', textStyle: 'ui.xs', color: 'warning.default' })
const actions = css({ display: 'flex' })
</script>

<template>
  <div :class="root" role="group" :aria-label="ariaLabel">
    <SortableList
      :items="rows"
      :list-id="listId"
      :item-key="(r) => r.id"
      :group="listId"
      :item-label="(r) => rowLabel(r.pair.key, r.index)"
      :show-handle="reorderable"
      :disabled="disabled || !reorderable"
      :aria-label="ariaLabel"
      empty-text="No entries"
      @move="onMove"
    >
      <template #default="{ item }">
        <div :class="row" :data-row="item.index">
          <Input
            :model-value="item.pair.key"
            :placeholder="keyPlaceholder"
            :disabled="disabled"
            :invalid="isDuplicate(item.pair.key)"
            :aria-label="`Key ${item.index + 1}`"
            :aria-describedby="isDuplicate(item.pair.key) ? `${item.id}-dup` : undefined"
            mono
            @update:model-value="(key: string) => setRow(item.index, { key })"
          />
          <slot
            name="value"
            :value="item.pair.value"
            :update="(value: V) => setRow(item.index, { value })"
            :index="item.index"
            :pair-key="item.pair.key"
            :disabled="disabled"
            :aria-label="`Value for ${rowLabel(item.pair.key, item.index)}`"
          >
            <Input
              :model-value="typeof item.pair.value === 'string' ? item.pair.value : String(item.pair.value ?? '')"
              :placeholder="valuePlaceholder"
              :disabled="disabled"
              :aria-label="`Value for ${rowLabel(item.pair.key, item.index)}`"
              @update:model-value="(value: string) => setRow(item.index, { value: value as V })"
            />
          </slot>
          <IconButton icon="lucide:x" :label="`Remove ${rowLabel(item.pair.key, item.index)}`" size="sm" :disabled="disabled" @click="remove(item.index)" />
          <div v-if="isDuplicate(item.pair.key)" :id="`${item.id}-dup`" :class="warning">Duplicate key: only one value is used.</div>
        </div>
      </template>
    </SortableList>
    <div :class="actions">
      <Button size="sm" variant="ghost" icon="lucide:plus" :disabled="disabled" @click="add">{{ addLabel }}</Button>
    </div>
  </div>
</template>
