<script setup lang="ts">
import type { Song } from '@stems/schema'
import { css } from 'styled-system/css'
import { onBeforeUnmount, ref, watch } from 'vue'
import { Badge, Button, Dialog, Input, SegmentedControl, Spinner, type SegmentOption } from '~/ui'
import { songFromImport } from '~/data/importSong'
import { library, onPathsDropped, pickPaths, type ImportMode, type ImportPlan } from '~/data/library'
import { saveSong } from '~/data/songs'
import { fileName, formatDuration, formatRate } from './format'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [song: Song] }>()

const paths = ref<string[]>([])
const plan = ref<ImportPlan | null>(null)
const title = ref('')
const mode = ref<ImportMode>('reference')
const planning = ref(false)
const importing = ref(false)
const error = ref<string | null>(null)
const hovering = ref(false)

const modes: SegmentOption<ImportMode>[] = [
  { value: 'reference', label: 'Keep in place' },
  { value: 'copy', label: 'Copy into library' },
]

async function choose(chosen: string[]) {
  if (!chosen.length) return
  paths.value = chosen
  error.value = null
  planning.value = true
  try {
    plan.value = await library.planImport(chosen)
    title.value = plan.value.title
  } catch (cause) {
    plan.value = null
    error.value = String(cause)
  } finally {
    planning.value = false
  }
}

async function runImport() {
  if (!plan.value?.files.length) return
  importing.value = true
  error.value = null
  try {
    const { song: imported } = await library.importSong(paths.value, mode.value)
    const song = songFromImport({ ...imported, title: title.value.trim() || imported.title })
    await saveSong(song)
    emit('imported', song)
    open.value = false
  } catch (cause) {
    error.value = String(cause)
  } finally {
    importing.value = false
  }
}

let stopDrop: (() => void) | null = null
watch(
  open,
  async (isOpen) => {
    stopDrop?.()
    stopDrop = null
    if (isOpen) {
      paths.value = []
      plan.value = null
      error.value = null
      stopDrop = await onPathsDropped(choose, (over) => (hovering.value = over))
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => stopDrop?.())

const zone = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '3',
  p: '6',
  borderWidth: '1px',
  borderStyle: 'dashed',
  borderColor: 'border.strong',
  borderRadius: 'md',
  bg: 'bg.input',
  color: 'fg.muted',
  textStyle: 'ui.sm',
  textAlign: 'center',
  '&[data-hover=true]': { borderColor: 'accent.default', bg: 'bg.hover', color: 'fg.default' },
})
const buttons = css({ display: 'flex', gap: '2' })
const stack = css({ display: 'flex', flexDirection: 'column', gap: '4' })
const fileList = css({ display: 'flex', flexDirection: 'column', maxH: '[280px]', overflowY: 'auto', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md' })
const fileRow = css({
  display: 'grid',
  gridTemplateColumns: '[1fr auto auto auto]',
  alignItems: 'center',
  gap: '3',
  px: '3',
  h: '[36px]',
  textStyle: 'ui.sm',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
  _last: { borderBottomWidth: '0' },
})
const swatch = css({ display: 'inline-block', w: '2', h: '2', borderRadius: 'full', mr: '2' })
const muted = css({ color: 'fg.muted', fontVariantNumeric: 'tabular-nums' })
const label = css({ textStyle: 'ui.label', color: 'fg.muted', mb: '1.5' })
const rejectedList = css({ display: 'flex', flexDirection: 'column', gap: '1', textStyle: 'ui.sm', color: 'warning.default' })
const errorText = css({ textStyle: 'ui.sm', color: 'danger.default' })
const footer = css({ display: 'flex', justifyContent: 'flex-end', gap: '2', w: 'full' })
</script>

<template>
  <Dialog v-model:open="open" title="Import stems" description="One folder, or a set of files, becomes one song." size="lg">
    <div :class="stack">
      <div :class="zone" :data-hover="hovering">
        <span>Drop a folder of stems or audio files on the window.</span>
        <div :class="buttons">
          <Button icon="lucide:folder-open" @click="pickPaths('folder').then(choose)">Choose folder…</Button>
          <Button variant="ghost" icon="lucide:file-audio" @click="pickPaths('files').then(choose)">Choose files…</Button>
        </div>
      </div>

      <div v-if="planning" :class="buttons"><Spinner :size="16" /> Reading files…</div>

      <template v-if="plan">
        <div>
          <div :class="label">Song title</div>
          <Input v-model="title" aria-label="Song title" />
        </div>
        <div v-if="plan.files.length">
          <div :class="label">{{ plan.files.length }} {{ plan.files.length === 1 ? 'track' : 'tracks' }}</div>
          <div :class="fileList">
            <div v-for="file in plan.files" :key="file.path" :class="fileRow">
              <span><span :class="swatch" :style="{ background: `var(--colors-track-${file.color})` }" />{{ file.name }}</span>
              <Badge v-if="file.kind !== 'stem'" size="sm" tone="info" :label="file.kind" />
              <span v-else />
              <span :class="muted">{{ formatRate(file.sampleRate) }} · {{ file.channels === 1 ? 'mono' : 'stereo' }}</span>
              <span :class="muted">{{ formatDuration(file.seconds) }}</span>
            </div>
          </div>
        </div>
        <div v-if="plan.rejected.length" :class="rejectedList">
          <span v-for="item in plan.rejected" :key="item.path">{{ fileName(item.path) }}: {{ item.reason }}</span>
        </div>
        <div>
          <div :class="label">Media</div>
          <SegmentedControl v-model="mode" :options="modes" aria-label="Media" />
        </div>
      </template>

      <div v-if="error" :class="errorText" role="alert">{{ error }}</div>
    </div>

    <template #footer="{ close }">
      <div :class="footer">
        <Button variant="ghost" @click="close">Cancel</Button>
        <Button variant="primary" icon="lucide:import" :loading="importing" :disabled="!plan?.files.length || planning" @click="runImport">
          Import
        </Button>
      </div>
    </template>
  </Dialog>
</template>
