<script setup lang="ts">
import { Icon } from '#components'
import { cva } from 'styled-system/css'
import { computed, ref } from 'vue'
import { checkFiles, formatBytes, type FileRejection } from './lib/files'

const props = withDefaults(
  defineProps<{
    /** Same syntax as the native attribute, e.g. `'image/*,.pdf'`. Also enforced for dropped files. */
    accept?: string
    /** Max bytes per file. */
    maxSize?: number
    multiple?: boolean
    disabled?: boolean
    label?: string
    /** Secondary line; defaults to a summary of `accept` / `maxSize`. */
    hint?: string
    size?: 'sm' | 'md'
    invalid?: boolean
  }>(),
  {
    accept: undefined,
    maxSize: undefined,
    multiple: true,
    disabled: false,
    label: undefined,
    hint: undefined,
    size: 'md',
    invalid: false,
  },
)

const emit = defineEmits<{
  /** Files that passed `accept` / `maxSize` (at most one unless `multiple`). Not emitted when empty. */
  files: [files: File[]]
  /** Files that failed a check, with the reason. */
  reject: [rejections: FileRejection[]]
}>()

defineSlots<{ default?: (scope: { dragging: boolean; browse: () => void }) => unknown }>()

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
// dragenter/dragleave fire for every child; count them so hovering children doesn't flicker.
let depth = 0

const defaultLabel = computed(() => props.label ?? (props.multiple ? 'Drop files or click to browse' : 'Drop a file or click to browse'))
const defaultHint = computed(() => {
  if (props.hint !== undefined) return props.hint
  const parts = [props.accept?.split(',').map((s) => s.trim()).join(', '), props.maxSize !== undefined ? `up to ${formatBytes(props.maxSize)}` : undefined]
  return parts.filter(Boolean).join(' · ')
})

function browse(): void {
  if (!props.disabled) input.value?.click()
}

function handle(list: FileList | null | undefined): void {
  if (!list || list.length === 0) return
  const { accepted, rejected } = checkFiles(Array.from(list), { accept: props.accept, maxSize: props.maxSize, multiple: props.multiple })
  if (rejected.length) emit('reject', rejected)
  if (accepted.length) emit('files', accepted)
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragenter(event: DragEvent): void {
  if (props.disabled || !hasFiles(event)) return
  event.preventDefault()
  depth++
  dragging.value = true
}

function onDragover(event: DragEvent): void {
  if (props.disabled || !hasFiles(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragleave(): void {
  depth = Math.max(0, depth - 1)
  if (depth === 0) dragging.value = false
}

function onDrop(event: DragEvent): void {
  if (props.disabled) return
  event.preventDefault()
  depth = 0
  dragging.value = false
  handle(event.dataTransfer?.files)
}

function onChange(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  handle(event.target.files)
  // Allow picking the same file again.
  event.target.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    browse()
  }
}

const zone = cva({
  base: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1',
    w: 'full',
    textAlign: 'center',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'border.strong',
    borderRadius: 'md',
    bg: 'bg.input',
    color: 'fg.muted',
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: 'fast',
    _hover: { borderColor: 'fg.subtle', color: 'fg.default' },
    _focusVisible: { outline: 'none', borderColor: 'accent.default', borderStyle: 'solid' },
    '&[data-dragging]': { borderColor: 'accent.default', borderStyle: 'solid', bg: 'accent.muted', color: 'fg.default' },
    '&[aria-disabled=true]': { opacity: 0.4, cursor: 'default', pointerEvents: 'none' },
    '& [data-part=label]': { textStyle: 'ui.sm', color: 'fg.default' },
    '& [data-part=hint]': { textStyle: 'ui.xs', color: 'fg.subtle' },
  },
  variants: {
    size: {
      sm: { p: '3', minH: '[64px]' },
      md: { p: '6', minH: '[128px]' },
    },
    invalid: { true: { borderColor: 'danger.default' } },
  },
})
</script>

<template>
  <div
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled || undefined"
    :aria-invalid="invalid || undefined"
    :class="zone({ size, invalid })"
    :data-dragging="dragging || undefined"
    @click="browse"
    @keydown="onKeydown"
    @dragenter="onDragenter"
    @dragover="onDragover"
    @dragleave="onDragleave"
    @drop="onDrop"
  >
    <slot :dragging="dragging" :browse="browse">
      <Icon name="lucide:upload" :size="size === 'sm' ? 16 : 20" aria-hidden="true" />
      <span data-part="label">{{ defaultLabel }}</span>
      <span v-if="defaultHint" data-part="hint">{{ defaultHint }}</span>
    </slot>
    <input ref="input" type="file" hidden :accept="accept" :multiple="multiple" :disabled="disabled" tabindex="-1" @change="onChange" @click.stop />
  </div>
</template>
