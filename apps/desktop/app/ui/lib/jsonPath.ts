// Paths into JSON values, written the way expressions read them: `a.b[0].c`, `a["odd key"]`.

export type PathSegment = string | number

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** Formats segments as an expression path. `base` is prepended (e.g. `query.result`). */
export function formatPath(segments: readonly PathSegment[], base = ''): string {
  let out = base
  for (const segment of segments) {
    if (typeof segment === 'number') out += `[${segment}]`
    else if (IDENTIFIER.test(segment)) out += out === '' ? segment : `.${segment}`
    else out += `[${JSON.stringify(segment)}]`
  }
  return out
}

const IDENTIFIER_AT = /[A-Za-z_$][\w$]*/y
const INDEX = /^\[(\d+)\]/
const QUOTED = /^\[("(?:[^"\\]|\\.)*")\]/

/**
 * Reads a path written by `formatPath` back into segments: `a.b[0]["odd key"]`
 * gives `['a', 'b', 0, 'odd key']`. `''` is the root (`[]`). Returns `null` for
 * anything `formatPath` would not produce.
 */
export function parsePath(path: string): PathSegment[] | null {
  const segments: PathSegment[] = []
  let i = 0
  while (i < path.length) {
    if (path[i] === '[') {
      const rest = path.slice(i)
      const index = INDEX.exec(rest)
      const quoted = index ? null : QUOTED.exec(rest)
      if (index) segments.push(Number(index[1]))
      else if (quoted) segments.push(JSON.parse(quoted[1]!) as string)
      else return null
      i += (index ?? quoted)![0].length
      continue
    }
    if (path[i] === '.') {
      if (segments.length === 0) return null
      i++
    } else if (segments.length > 0) return null
    IDENTIFIER_AT.lastIndex = i
    const name = IDENTIFIER_AT.exec(path)
    if (!name) return null
    segments.push(name[0])
    i += name[0].length
  }
  return segments
}

/** Reads a value at `segments`; `undefined` when any step is missing. */
export function getAtPath(root: unknown, segments: readonly PathSegment[]): unknown {
  let current = root
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<PathSegment, unknown>)[segment]
  }
  return current
}

/**
 * Returns a copy of `root` with `value` written at `segments`, creating objects
 * (or arrays, for numeric segments) along the way. Writing `undefined` into an
 * object removes the key. The input is never mutated.
 */
export function setAtPath(root: unknown, segments: readonly PathSegment[], value: unknown): unknown {
  if (segments.length === 0) return value
  const [head, ...rest] = segments as [PathSegment, ...PathSegment[]]
  const isIndex = typeof head === 'number'
  if (Array.isArray(root) || (isIndex && (root === null || typeof root !== 'object'))) {
    const list = Array.isArray(root) ? [...root] : []
    const index = Number(head)
    list[index] = setAtPath(list[index], rest, value)
    return list
  }
  const record: Record<string, unknown> = root !== null && typeof root === 'object' ? { ...(root as Record<string, unknown>) } : {}
  const key = String(head)
  const next = setAtPath(record[key], rest, value)
  if (next === undefined) delete record[key]
  else record[key] = next
  return record
}

/** Moves one item inside an array copy; `to` is the final index after removal. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list]
  if (from < 0 || from >= copy.length) return copy
  const [item] = copy.splice(from, 1) as [T]
  copy.splice(Math.max(0, Math.min(to, copy.length)), 0, item)
  return copy
}
