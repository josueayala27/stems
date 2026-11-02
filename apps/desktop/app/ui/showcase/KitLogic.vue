<script setup lang="ts">
// Wave 6 data and logic components: a plugin input form, headers, a step tree and result viewers.
// Wave 10: SplitPane and JsonTree marks / select-path.
import { css } from 'styled-system/css'
import { computed, ref } from 'vue'
import {
  applyMove,
  Badge,
  CodeBlock,
  JsonTree,
  KeyValueEditor,
  SchemaForm,
  SortableList,
  SplitPane,
  type JsonSchema,
  type SplitPaneItem,
  type KeyValuePair,
  type SchemaIssue,
  type SortableMove,
} from '../index'

const emit = defineEmits<{ log: [message: string] }>()

const schema: JsonSchema = {
  type: 'object',
  required: ['baseUrl', 'method'],
  properties: {
    baseUrl: { type: 'string', format: 'uri', title: 'Base URL', description: 'Every request path is resolved against it.' },
    method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
    timeout: { type: 'integer', minimum: 1, maximum: 60, description: 'Seconds before the request is aborted.' },
    followRedirects: { type: 'boolean', title: 'Follow redirects' },
    apiKey: { type: 'string', 'x-secret': true, title: 'API key', description: 'Stored encrypted; never shown again.' },
    body: { type: 'string', 'x-multiline': true, description: 'Sent as JSON.' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    retry: {
      type: 'object',
      title: 'Retry policy',
      properties: { attempts: { type: 'integer', minimum: 0, maximum: 5 }, backoff: { type: 'string', enum: ['linear', 'exponential'] } },
    },
  },
}

const config = ref<unknown>({ baseUrl: 'https://api.example.com', method: 'GET', tags: ['public'] })
const issues = ref<SchemaIssue[]>([])

const headers = ref<KeyValuePair[]>([
  { key: 'Accept', value: 'application/json' },
  { key: 'X-Trace', value: 'on' },
])

interface Step {
  id: string
  label: string
}

const steps = ref<Record<string, Step[]>>({
  root: [{ id: 's1', label: 'Set variable' }, { id: 'if1', label: 'If cart is empty' }, { id: 's4', label: 'Navigate to /checkout' }],
  'if1.then': [{ id: 's2', label: 'Show toast' }],
  'if1.else': [{ id: 's3', label: 'Run query' }],
})

function onMove(move: SortableMove): void {
  steps.value = { ...steps.value, ...applyMove(steps.value, move) }
  emit('log', `move ${move.from.listId}[${move.from.index}] → ${move.to.listId}[${move.to.index}]`)
}

const result = computed(() => ({
  config: config.value,
  headers: headers.value,
  items: Array.from({ length: 140 }, (_, i) => ({ id: i + 1, title: `Post ${i + 1}`, published: i % 3 !== 0, score: i % 7 === 0 ? null : i * 1.5 })),
}))
const resultJson = computed(() => JSON.stringify({ config: config.value, headers: headers.value }, null, 2))

// SplitPane + JsonTree marks: a scope explorer beside an expression and its result.
const splitPanes: SplitPaneItem[] = [
  { id: 'scope', min: 180, max: 480, label: 'scope' },
  { id: 'work', min: 240, label: 'editor' },
]
const workPanes: SplitPaneItem[] = [
  { id: 'expression', min: 64, label: 'expression' },
  { id: 'result', min: 64, label: 'result' },
]
const split = ref([35, 65])
const workSplit = ref([50, 50])
const splitLabel = computed(() => split.value.map((s) => `${Math.round(s)}%`).join(' / '))
const scope = {
  item: { title: 'Linen shirt', price: 48, tags: ['summer', 'new'] },
  queries: { products: { data: [{ title: 'Linen shirt', price: 48 }, { title: 'Canvas tote', price: 22 }] } },
}
const marked = ref<string[]>(['item.price', 'queries.products.data[0].title'])
const expression = computed(() => (marked.value.length ? marked.value.join(' + ') : 'item.title'))

function toggleMark(path: string): void {
  marked.value = marked.value.includes(path) ? marked.value.filter((p) => p !== path) : [...marked.value, path]
  emit('log', `select-path ${path}`)
}

const grid = css({ display: 'grid', gridTemplateColumns: '[repeat(auto-fit, minmax(320px, 1fr))]', gap: '4', alignItems: 'start' })
const card = css({ display: 'flex', flexDirection: 'column', gap: '3', p: '3', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'md', minW: '0' })
const cardTitle = css({ display: 'flex', alignItems: 'center', gap: '2', textStyle: 'ui.title', color: 'fg.default' })
const stepRow = css({ display: 'flex', flexDirection: 'column', gap: '1', py: '1', textStyle: 'ui.sm', color: 'fg.default' })
const branch = css({ display: 'flex', flexDirection: 'column', gap: '1', pl: '2', borderLeftWidth: '1px', borderColor: 'border.default' })
const branchLabel = css({ textStyle: 'ui.label', color: 'fg.subtle' })
const wide = css({ gridColumn: '[1 / -1]' })
const splitFrame = css({ h: '80', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'sm', overflow: 'hidden' })
const paneBody = css({ display: 'flex', flexDirection: 'column', gap: '2', h: 'full', p: '2', overflow: 'auto' })
</script>

<template>
  <section :class="grid" aria-label="Data and logic components">
    <div :class="card">
      <div :class="cardTitle">
        SchemaForm
        <Badge :tone="issues.length ? 'warning' : 'success'" :label="issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Valid'" />
      </div>
      <SchemaForm v-model="config" :schema="schema" :stored-secrets="['apiKey']" @issues="issues = $event" />
    </div>

    <div :class="card">
      <div :class="cardTitle">KeyValueEditor</div>
      <KeyValueEditor v-model="headers" key-placeholder="Header" value-placeholder="Value" add-label="Add header" aria-label="Headers" />
      <div :class="cardTitle">SortableList</div>
      <SortableList :items="steps.root!" list-id="root" item-key="id" group="steps" :item-label="(s) => s.label" aria-label="Workflow steps" @move="onMove">
        <template #default="{ item }">
          <div :class="stepRow">
            <span>{{ item.label }}</span>
            <template v-if="item.id === 'if1'">
              <div v-for="name in ['then', 'else']" :key="name" :class="branch">
                <span :class="branchLabel">{{ name }}</span>
                <SortableList
                  :items="steps[`if1.${name}`] ?? []"
                  :list-id="`if1.${name}`"
                  item-key="id"
                  group="steps"
                  :item-label="(s) => s.label"
                  :aria-label="`${name} branch`"
                  @move="onMove"
                >
                  <template #default="{ item: inner }">
                    <div :class="stepRow">{{ inner.label }}</div>
                  </template>
                </SortableList>
              </div>
            </template>
          </div>
        </template>
      </SortableList>
    </div>

    <div :class="card">
      <div :class="cardTitle">JsonTree</div>
      <JsonTree :value="result" base-path="query.result" root-label="result" :expand-depth="2" @copy="emit('log', `copied ${$event.kind}: ${$event.path}`)" @select="emit('log', `select ${$event.path}`)" />
      <div :class="cardTitle">CodeBlock</div>
      <CodeBlock :code="resultJson" language="json" line-numbers max-height="240px" />
    </div>

    <div :class="[card, wide]">
      <div :class="cardTitle">
        SplitPane
        <Badge tone="neutral" :label="splitLabel" />
      </div>
      <div :class="splitFrame">
        <SplitPane v-model:sizes="split" :panes="splitPanes" @resize-end="emit('log', `split ${$event.map((s) => s.toFixed(1)).join(' / ')}`)">
          <template #scope>
            <div :class="paneBody">
              <div :class="branchLabel">Scope (click a key to mark it)</div>
              <JsonTree :value="scope" :marked="marked" :toolbar="false" :expand-depth="2" aria-label="Scope" @select-path="toggleMark" />
            </div>
          </template>
          <template #work>
            <SplitPane v-model:sizes="workSplit" direction="vertical" :panes="workPanes">
              <template #expression>
                <div :class="paneBody">
                  <div :class="branchLabel">Expression</div>
                  <CodeBlock :code="expression" wrap />
                </div>
              </template>
              <template #result>
                <div :class="paneBody">
                  <div :class="branchLabel">Marked paths</div>
                  <CodeBlock :code="marked.join('\n') || '(none)'" />
                </div>
              </template>
            </SplitPane>
          </template>
        </SplitPane>
      </div>
    </div>
  </section>
</template>
