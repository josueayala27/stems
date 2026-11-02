<script setup lang="ts">
// Wave 5 data components in a CMS-like composition: items table, item sheet, confirm dialog.
import { css } from 'styled-system/css'
import { computed, ref } from 'vue'
import {
  Badge,
  Button,
  Combobox,
  DataTable,
  DateField,
  Dialog,
  EmptyState,
  FileDrop,
  Input,
  MultiCombobox,
  PropertyRow,
  Sheet,
  sortRows,
  type BadgeTone,
  type ComboboxOption,
  type DataTableColumn,
  type TableSort,
} from '../index'

const emit = defineEmits<{ log: [message: string] }>()

type Status = 'draft' | 'published' | 'scheduled' | 'archived'

interface Post {
  id: string
  title: string
  author: string
  status: Status
  views: number
  updatedAt: string
}

const STATUS: Record<Status, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  archived: { label: 'Archived', tone: 'warning' },
}
const statuses = Object.keys(STATUS) as Status[]
const authors: ComboboxOption[] = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Linus Torvalds'].map((name, i) => ({
  value: `u${i}`,
  label: name,
  description: `${name.split(' ')[0]!.toLowerCase()}@malla.site`,
}))
const tags = ref<ComboboxOption[]>(['Design', 'Engineering', 'Product', 'Release', 'Tutorial'].map((t) => ({ value: t.toLowerCase(), label: t })))

const posts = ref<Post[]>(
  Array.from({ length: 500 }, (_, i) => ({
    id: `p${i + 1}`,
    title: `Post ${i + 1}: ${['Launch notes', 'Design tokens', 'Realtime sync', 'Forms', 'CMS bindings'][i % 5]}`,
    author: authors[i % authors.length]!.value,
    status: statuses[(i * 7) % 4]!,
    views: (i * 7919) % 10000,
    updatedAt: new Date(2026, 9, 1 + (i % 28), 9 + (i % 8)).toISOString(),
  })),
)

const columns: DataTableColumn<Post>[] = [
  { key: 'title', header: 'Title', sortable: true },
  { key: 'author', header: 'Author', sortable: true, width: '160px', accessor: (p) => authors.find((a) => a.value === p.author)?.label },
  { key: 'status', header: 'Status', sortable: true, width: '120px' },
  { key: 'views', header: 'Views', sortable: true, width: '90px', align: 'right' },
  { key: 'updatedAt', header: 'Updated', sortable: true, width: '160px', accessor: (p) => new Date(p.updatedAt).toLocaleDateString() },
]

const query = ref('')
const sort = ref<TableSort | null>({ key: 'views', direction: 'desc' })
const selected = ref<string[]>([])
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q ? posts.value.filter((p) => p.title.toLowerCase().includes(q)) : posts.value
  const s = sort.value
  const column = s && columns.find((c) => c.key === s.key)
  // Parent-side sort, like the CMS does on the server.
  if (!s || !column) return list
  return sortRows(list, (p) => (s.key === 'updatedAt' ? p.updatedAt : column.accessor ? column.accessor(p) : p[s.key as keyof Post]), s.direction)
})

// Item sheet
const editing = ref<Post | null>(null)
const sheetOpen = ref(false)
const publishAt = ref<string | null>(null)
const day = ref<string | null>('2026-10-22')
const postTags = ref<string[]>(['design'])
const author = ref<string | null>(null)

function openPost(post: Post): void {
  editing.value = post
  author.value = post.author
  publishAt.value = post.status === 'scheduled' ? post.updatedAt : null
  sheetOpen.value = true
  emit('log', `row-click ${post.id}`)
}

async function searchAuthors(q: string): Promise<ComboboxOption[]> {
  await new Promise((r) => setTimeout(r, 300))
  const needle = q.toLowerCase()
  return authors.filter((a) => a.label.toLowerCase().includes(needle))
}

function createTag(label: string): void {
  const option = { value: label.toLowerCase().replace(/\s+/g, '-'), label }
  tags.value = [...tags.value, option]
  postTags.value = [...postTags.value, option.value]
  emit('log', `create tag "${label}"`)
}

// Confirm dialog
const confirmOpen = ref(false)
function archiveSelected(): void {
  const ids = new Set(selected.value)
  posts.value = posts.value.map((p) => (ids.has(p.id) ? { ...p, status: 'archived' } : p))
  emit('log', `archived ${ids.size} items`)
  selected.value = []
  confirmOpen.value = false
}

const card = css({ display: 'flex', flexDirection: 'column', gap: '3', p: '4', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md' })
const cardTitle = css({ textStyle: 'ui.label', color: 'fg.muted' })
const toolbar = css({ display: 'flex', alignItems: 'center', gap: '2' })
const grow = css({ flex: '1' })
const tableBox = css({ h: '[360px]', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'sm', overflow: 'hidden' })
const row = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2' })
const grid = css({ display: 'grid', gridTemplateColumns: '[repeat(auto-fit, minmax(240px, 1fr))]', gap: '3' })
const field = css({ display: 'flex', flexDirection: 'column', gap: '1.5', textStyle: 'ui.xs', color: 'fg.muted' })
const sheetBody = css({ display: 'flex', flexDirection: 'column', gap: '2' })
</script>

<template>
  <section :class="card">
    <div :class="cardTitle">Data table — 500 rows (virtualized), sort, shift-click range selection, row click opens a sheet</div>
    <div :class="toolbar">
      <Input v-model="query" live type="search" placeholder="Search posts…" aria-label="Search posts" :class="grow" />
      <span v-if="selected.length" :class="cardTitle">{{ selected.length }} selected</span>
      <Button size="sm" :disabled="selected.length === 0" @click="confirmOpen = true">Archive</Button>
    </div>
    <div :class="tableBox">
      <DataTable
        v-model:sort="sort"
        v-model:selected="selected"
        :rows="filtered"
        :columns="columns"
        row-key="id"
        selectable
        :active-key="sheetOpen ? editing?.id : null"
        aria-label="Posts"
        @row-click="openPost"
      >
        <template #cell-status="{ row: post }">
          <Badge :tone="STATUS[post.status].tone" dot>{{ STATUS[post.status].label }}</Badge>
        </template>
        <template #empty>
          <EmptyState size="sm" icon="lucide:search-x" title="No posts match" :description="`Nothing found for “${query}”.`" />
        </template>
      </DataTable>
    </div>
  </section>

  <section :class="card">
    <div :class="cardTitle">Badges</div>
    <div :class="row">
      <Badge>Neutral</Badge>
      <Badge tone="success" dot>Published</Badge>
      <Badge tone="warning" dot>Changes</Badge>
      <Badge tone="danger" icon="lucide:circle-alert">Failed</Badge>
      <Badge tone="info" icon="lucide:clock" size="md">Scheduled</Badge>
    </div>
  </section>

  <section :class="card">
    <div :class="cardTitle">Fields — combobox (async), multi combobox (create), date, date + time, file drop</div>
    <div :class="grid">
      <label :class="field">Author (async search)<Combobox v-model="author" :search="searchAuthors" clearable placeholder="Search people…" aria-label="Author" @update:model-value="emit('log', `author ${$event}`)" /></label>
      <label :class="field">Tags<MultiCombobox v-model="postTags" :options="tags" creatable clearable placeholder="Add tags…" aria-label="Tags" @create="createTag" /></label>
      <label :class="field">Date<DateField v-model="day" aria-label="Date" @update:model-value="emit('log', `date ${$event}`)" /></label>
      <label :class="field">Publish at<DateField v-model="publishAt" with-time aria-label="Publish at" @update:model-value="emit('log', `publish at ${$event}`)" /></label>
    </div>
    <FileDrop accept="image/*,.pdf" :max-size="5 * 1024 * 1024" @files="emit('log', `files: ${$event.map((f) => f.name).join(', ')}`)" @reject="emit('log', `rejected: ${$event.map((r) => `${r.file.name} (${r.reason})`).join(', ')}`)" />
  </section>

  <section :class="card">
    <div :class="cardTitle">Empty state</div>
    <EmptyState icon="lucide:database" title="No collections yet" description="Collections hold structured content like blog posts, team members or products.">
      <template #actions>
        <Button variant="primary" size="sm" icon="lucide:plus" @click="emit('log', 'new collection')">New collection</Button>
      </template>
    </EmptyState>
  </section>

  <Sheet v-model:open="sheetOpen" :title="editing?.title" :description="editing ? `${STATUS[editing.status].label} · ${editing.views} views` : undefined" size="md">
    <div :class="sheetBody">
      <PropertyRow label="Author"><Combobox v-model="author" :options="authors" aria-label="Author" /></PropertyRow>
      <PropertyRow label="Tags"><MultiCombobox v-model="postTags" :options="tags" creatable aria-label="Tags" @create="createTag" /></PropertyRow>
      <PropertyRow label="Publish"><DateField v-model="publishAt" with-time aria-label="Publish at" /></PropertyRow>
    </div>
    <template #footer="{ close }">
      <Button size="sm" variant="ghost" @click="close">Cancel</Button>
      <Button size="sm" variant="primary" @click="emit('log', `saved ${editing?.id}`), close()">Save</Button>
    </template>
  </Sheet>

  <Dialog v-model:open="confirmOpen" role="alertdialog" size="sm" :title="`Archive ${selected.length} items?`" description="Archived items are unpublished and hidden from collection lists." @dismiss="emit('log', `dialog dismiss: ${$event}`)">
    <template #footer="{ close }">
      <Button size="sm" variant="ghost" data-autofocus @click="close">Cancel</Button>
      <Button size="sm" variant="danger" @click="archiveSelected">Archive</Button>
    </template>
  </Dialog>
</template>
