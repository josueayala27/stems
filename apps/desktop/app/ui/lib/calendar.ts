// Date helpers for DateField. Calendar days are local `YYYY-MM-DD` strings;
// values with a time are full ISO strings (UTC) built from the local day and time.

export interface DateParts {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string
  /** Local time, `HH:mm`. */
  time: string
}

export interface CalendarDay {
  date: string
  day: number
  inMonth: boolean
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

const pad = (n: number) => String(n).padStart(2, '0')

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight of a `YYYY-MM-DD` day. */
export function fromIsoDate(date: string): Date | null {
  const m = DATE_ONLY.exec(date)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isoDate(d) === date ? d : null
}

/** Splits a model value into local day + time; `null` for empty or invalid values. */
export function parseValue(value: string | null | undefined): DateParts | null {
  if (!value) return null
  if (DATE_ONLY.test(value)) return fromIsoDate(value) ? { date: value, time: '00:00' } : null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return { date: isoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

/** Model value: `YYYY-MM-DD` without time, otherwise an ISO instant for the local day and time. */
export function buildValue(date: string, time: string | null): string | null {
  const day = fromIsoDate(date)
  if (!day) return null
  if (time === null) return date
  const [h, m] = time.split(':').map(Number)
  day.setHours(h ?? 0, m ?? 0, 0, 0)
  return day.toISOString()
}

export function addDays(date: string, n: number): string {
  const d = fromIsoDate(date) ?? new Date()
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

/** Same day `n` months later, clamped to the month's last day (Jan 31 + 1 → Feb 28/29). */
export function addMonths(date: string, n: number): string {
  const d = fromIsoDate(date) ?? new Date()
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return isoDate(d)
}

/** Six weeks covering `month` (0-based), starting on `weekStartsOn` (0 = Sunday, 1 = Monday). */
export function monthGrid(year: number, month: number, weekStartsOn = 1): CalendarDay[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  const start = new Date(year, month, 1 - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { date: isoDate(d), day: d.getDate(), inMonth: d.getMonth() === month }
  })
}

/** Index of `date` in its week (0..6) for a week starting on `weekStartsOn`. */
export function weekdayIndex(date: string, weekStartsOn = 1): number {
  const d = fromIsoDate(date) ?? new Date()
  return (d.getDay() - weekStartsOn + 7) % 7
}

export function inRange(date: string, min?: string, max?: string): boolean {
  return (!min || date >= min) && (!max || date <= max)
}
