<script setup lang="ts">
import { Icon } from '#components'
import { css, cva } from 'styled-system/css'
import { computed, nextTick, ref, useId, watch } from 'vue'
import Button from './Button.vue'
import IconButton from './IconButton.vue'
import Popover from './Popover.vue'
import { addDays, addMonths, buildValue, fromIsoDate, inRange, isoDate, monthGrid, parseValue, weekdayIndex } from './lib/calendar'
import type { ControlSize } from './types'

// Fragment root (trigger + teleported calendar): attrs go to the trigger button.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** Adds a time input; the model becomes an ISO instant instead of `YYYY-MM-DD`. */
    withTime?: boolean
    /** Earliest / latest selectable day, `YYYY-MM-DD`. */
    min?: string
    max?: string
    clearable?: boolean
    placeholder?: string
    /** 0 = Sunday, 1 = Monday. */
    weekStartsOn?: 0 | 1
    /** BCP 47 locale for display; defaults to the browser's. */
    locale?: string
    size?: ControlSize
    disabled?: boolean
    invalid?: boolean
    ariaLabel?: string
  }>(),
  {
    withTime: false,
    min: undefined,
    max: undefined,
    clearable: true,
    placeholder: 'Pick a date',
    weekStartsOn: 1,
    locale: undefined,
    size: 'md',
    disabled: false,
    invalid: false,
    ariaLabel: undefined,
  },
)

/** `YYYY-MM-DD`, or an ISO instant (`toISOString()`) when `withTime`; `null` when empty. */
const model = defineModel<string | null>({ default: null })

const id = useId()
const open = ref(false)
const grid = ref<HTMLElement | null>(null)
const parts = computed(() => parseValue(model.value))
const today = () => isoDate(new Date())
const focused = ref(parts.value?.date ?? today())
const time = ref(parts.value?.time ?? '09:00')

watch(open, (value) => {
  if (!value) return
  focused.value = parts.value?.date ?? clampDay(today())
  time.value = parts.value?.time ?? time.value
})

const view = computed(() => {
  const d = fromIsoDate(focused.value) ?? new Date()
  return { year: d.getFullYear(), month: d.getMonth() }
})
const weeks = computed(() => {
  const days = monthGrid(view.value.year, view.value.month, props.weekStartsOn)
  return Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7))
})
const monthLabel = computed(() => new Intl.DateTimeFormat(props.locale, { month: 'long', year: 'numeric' }).format(new Date(view.value.year, view.value.month, 1)))
const weekdays = computed(() => {
  const fmt = new Intl.DateTimeFormat(props.locale, { weekday: 'short' })
  const long = new Intl.DateTimeFormat(props.locale, { weekday: 'long' })
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2023, 0, 1 + ((i + props.weekStartsOn) % 7))
    return { short: fmt.format(d).slice(0, 2), long: long.format(d) }
  })
})

const display = computed(() => {
  const p = parts.value
  if (!p) return ''
  const day = fromIsoDate(p.date)!
  if (!props.withTime) return new Intl.DateTimeFormat(props.locale, { dateStyle: 'medium' }).format(day)
  const [h, m] = p.time.split(':').map(Number)
  day.setHours(h ?? 0, m ?? 0)
  return new Intl.DateTimeFormat(props.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(day)
})

function clampDay(date: string): string {
  if (props.min && date < props.min) return props.min
  if (props.max && date > props.max) return props.max
  return date
}

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat(props.locale, { dateStyle: 'full' }).format(fromIsoDate(date)!)
}

function select(date: string): void {
  if (!inRange(date, props.min, props.max)) return
  focused.value = date
  model.value = buildValue(date, props.withTime ? time.value : null)
  if (!props.withTime) open.value = false
}

function onTime(event: Event): void {
  if (!(event.target instanceof HTMLInputElement) || !event.target.value) return
  time.value = event.target.value
  const date = parts.value?.date ?? focused.value
  model.value = buildValue(date, time.value)
}

function moveTo(date: string): void {
  focused.value = date
  void nextTick(() => grid.value?.querySelector<HTMLElement>('[data-focused]')?.focus())
}

function onGridKeydown(event: KeyboardEvent): void {
  const f = focused.value
  const moves: Record<string, () => string> = {
    ArrowLeft: () => addDays(f, -1),
    ArrowRight: () => addDays(f, 1),
    ArrowUp: () => addDays(f, -7),
    ArrowDown: () => addDays(f, 7),
    Home: () => addDays(f, -weekdayIndex(f, props.weekStartsOn)),
    End: () => addDays(f, 6 - weekdayIndex(f, props.weekStartsOn)),
    PageUp: () => addMonths(f, event.shiftKey ? -12 : -1),
    PageDown: () => addMonths(f, event.shiftKey ? 12 : 1),
  }
  const move = moves[event.key]
  if (move) {
    event.preventDefault()
    moveTo(move())
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    select(f)
  }
}

function clear(): void {
  model.value = null
  open.value = false
}

function setToday(): void {
  if (props.withTime) {
    const now = new Date()
    time.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }
  select(clampDay(today()))
}

const trigger = cva({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5',
    w: 'full',
    minW: '0',
    px: '2',
    borderRadius: 'sm',
    bg: 'bg.input',
    color: 'fg.default',
    borderWidth: '1px',
    borderColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transitionProperty: 'border-color',
    transitionDuration: 'fast',
    _hover: { borderColor: 'border.default' },
    _focusVisible: { outline: 'none', borderColor: 'accent.default' },
    '&[aria-expanded=true]': { borderColor: 'accent.default' },
    '& [data-part=value]': { flex: '1', minW: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    '& [data-part=value][data-empty]': { color: 'fg.subtle' },
    '& [data-part=icon]': { color: 'fg.subtle', flexShrink: 0 },
    _disabled: { opacity: 0.4, pointerEvents: 'none' },
  },
  variants: {
    size: {
      sm: { h: 'control.sm', textStyle: 'ui.xs' },
      md: { h: 'control.md', textStyle: 'ui.sm' },
    },
    invalid: { true: { borderColor: 'danger.default', _hover: { borderColor: 'danger.default' } } },
  },
})
const panel = css({ display: 'flex', flexDirection: 'column', gap: '2', w: '[252px]' })
const head = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1' })
const monthClass = css({ textStyle: 'ui.title', color: 'fg.default', textTransform: 'capitalize' })
const table = css({
  w: 'full',
  borderCollapse: 'collapse',
  '& th': { h: '6', textStyle: 'ui.xs', color: 'fg.subtle', fontWeight: 'medium', textAlign: 'center' },
  '& td': { p: '0', textAlign: 'center' },
})
const day = css({
  display: 'inline-grid',
  placeItems: 'center',
  w: '8',
  h: '8',
  borderRadius: 'sm',
  textStyle: 'ui.sm',
  color: 'fg.default',
  cursor: 'pointer',
  _hover: { bg: 'bg.hover' },
  _focusVisible: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'accent.default', outlineOffset: '[-2px]' },
  '&[data-outside]': { color: 'fg.subtle' },
  '&[data-today]': { fontWeight: 'semibold', color: 'accent.default' },
  '&[aria-selected=true]': { bg: 'accent.default', color: 'fg.onAccent', _hover: { bg: 'accent.hover' } },
  _disabled: { opacity: 0.3, cursor: 'default', pointerEvents: 'none' },
})
const timeRow = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  pt: '2',
  borderTopWidth: '1px',
  borderColor: 'border.default',
  textStyle: 'ui.sm',
  color: 'fg.muted',
  '& input': {
    flex: '1',
    h: 'control.md',
    px: '2',
    borderRadius: 'sm',
    bg: 'bg.input',
    color: 'fg.default',
    borderWidth: '1px',
    borderColor: 'transparent',
    colorScheme: 'dark',
    _light: { colorScheme: 'light' },
    _focus: { outline: 'none', borderColor: 'accent.default' },
  },
})
const foot = css({ display: 'flex', justifyContent: 'space-between', gap: '2' })

defineExpose({ open: () => (open.value = true), close: () => (open.value = false) })
</script>

<template>
  <Popover v-model:open="open" role="dialog" placement="bottom-start" padding="md" :aria-label="ariaLabel ?? 'Choose date'">
    <template #trigger="{ props: triggerProps }">
      <button
        v-bind="{ ...$attrs, ...triggerProps }"
        type="button"
        :class="trigger({ size, invalid })"
        :disabled="disabled"
        :aria-label="ariaLabel ? `${ariaLabel}${display ? `: ${display}` : ''}` : undefined"
        :aria-invalid="invalid || undefined"
      >
        <Icon :name="withTime ? 'lucide:calendar-clock' : 'lucide:calendar'" :size="14" data-part="icon" aria-hidden="true" />
        <span data-part="value" :data-empty="!display || undefined">{{ display || placeholder }}</span>
      </button>
    </template>
    <div :class="panel">
      <div :class="head">
        <IconButton icon="lucide:chevron-left" label="Previous month" size="sm" :tooltip="false" @click="focused = addMonths(focused, -1)" />
        <span :id="`${id}-month`" :class="monthClass" aria-live="polite">{{ monthLabel }}</span>
        <IconButton icon="lucide:chevron-right" label="Next month" size="sm" :tooltip="false" @click="focused = addMonths(focused, 1)" />
      </div>
      <table ref="grid" role="grid" :aria-labelledby="`${id}-month`" :class="table" @keydown="onGridKeydown">
        <thead>
          <tr>
            <th v-for="w in weekdays" :key="w.long" scope="col" :abbr="w.long">{{ w.short }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, i) in weeks" :key="i">
            <td v-for="cell in week" :key="cell.date">
              <button
                type="button"
                :class="day"
                :tabindex="cell.date === focused ? 0 : -1"
                :aria-label="dayLabel(cell.date)"
                :aria-selected="cell.date === parts?.date"
                :aria-current="cell.date === today() ? 'date' : undefined"
                :data-focused="cell.date === focused || undefined"
                :data-autofocus="cell.date === focused || undefined"
                :data-outside="!cell.inMonth || undefined"
                :data-today="cell.date === today() || undefined"
                :disabled="!inRange(cell.date, min, max)"
                @click="select(cell.date)"
              >
                {{ cell.day }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <label v-if="withTime" :class="timeRow">
        Time
        <input type="time" :value="time" step="60" @change="onTime" />
      </label>
      <div :class="foot">
        <Button size="sm" variant="ghost" @click="setToday">{{ withTime ? 'Now' : 'Today' }}</Button>
        <Button v-if="clearable && model" size="sm" variant="ghost" @click="clear">Clear</Button>
      </div>
    </div>
  </Popover>
</template>
