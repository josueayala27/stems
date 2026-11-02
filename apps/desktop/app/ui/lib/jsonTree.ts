// Flattens a JSON value into the visible rows of a tree view. Rendering a flat
// list keeps keyboard navigation and windowing simple: the tree component only
// maps rows to elements.
import { formatPath, type PathSegment } from './jsonPath'

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'circular' | 'other'

interface RowBase {
  /** Stable id: the formatted path (`''` for the root). */
  id: string
  path: PathSegment[]
  /** 0-based nesting level. */
  depth: number
  /** 1-based position among siblings and the sibling count, for `aria-posinset`/`aria-setsize`. */
  posinset: number
  setsize: number
}

export interface JsonNodeRow extends RowBase {
  kind: 'node'
  /** Property name or array index; `null` for the root. */
  key: PathSegment | null
  value: unknown
  type: JsonType
  /** Number of children for objects and arrays. */
  size: number
  expandable: boolean
  expanded: boolean
  /** The node is a container but sits at the depth limit, so it cannot open. */
  depthLimited: boolean
}

export interface JsonMoreRow extends RowBase {
  kind: 'more'
  /** Id of the container whose children are cut off. */
  parentId: string
  shown: number
  total: number
}

export type JsonTreeRow = JsonNodeRow | JsonMoreRow

export interface JsonTreeSelectEvent {
  /** Formatted path including the tree's `basePath`. */
  path: string
  segments: PathSegment[]
  value: unknown
}

export interface JsonTreeCopyEvent {
  kind: 'value' | 'path'
  text: string
  path: string
}

export interface FlattenOptions {
  /** Ids of open containers. */
  expanded: ReadonlySet<string>
  /** Children shown per container id; containers not listed show `pageSize`. */
  limits?: ReadonlyMap<string, number>
  pageSize?: number
  /** Containers at this depth do not open. */
  maxDepth?: number
}

export const JSON_TREE_PAGE_SIZE = 100
export const JSON_TREE_MAX_DEPTH = 20

export function jsonType(value: unknown): JsonType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  switch (typeof value) {
    case 'object':
      return 'object'
    case 'string':
      return 'string'
    case 'number':
    case 'bigint':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'undefined':
      return 'undefined'
    default:
      return 'other'
  }
}

function isContainer(type: JsonType): boolean {
  return type === 'object' || type === 'array'
}

/** Child entries of a container, as `[key, value]` pairs. */
export function jsonChildren(value: unknown): Array<[PathSegment, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [index, item])
  if (value !== null && typeof value === 'object') return Object.entries(value as Record<string, unknown>)
  return []
}

function childCount(value: unknown, type: JsonType): number {
  if (type === 'array') return (value as unknown[]).length
  if (type === 'object') return Object.keys(value as object).length
  return 0
}

export function flattenJson(root: unknown, options: FlattenOptions): JsonTreeRow[] {
  const pageSize = options.pageSize ?? JSON_TREE_PAGE_SIZE
  const maxDepth = options.maxDepth ?? JSON_TREE_MAX_DEPTH
  const rows: JsonTreeRow[] = []
  const ancestors: object[] = []

  function visit(value: unknown, key: PathSegment | null, path: PathSegment[], depth: number, posinset: number, setsize: number): void {
    const id = formatPath(path)
    let type = jsonType(value)
    if (isContainer(type) && ancestors.includes(value as object)) type = 'circular'
    const container = isContainer(type)
    const size = container ? childCount(value, type) : 0
    const depthLimited = container && depth >= maxDepth
    const expandable = container && !depthLimited && size > 0
    const expanded = expandable && options.expanded.has(id)
    rows.push({ kind: 'node', id, path, key, value, type, size, expandable, expanded, depthLimited, depth, posinset, setsize })
    if (!expanded) return

    ancestors.push(value as object)
    const entries = jsonChildren(value)
    const limit = Math.max(pageSize, options.limits?.get(id) ?? pageSize)
    const shown = Math.min(entries.length, limit)
    const siblings = shown < entries.length ? shown + 1 : shown
    for (let i = 0; i < shown; i++) {
      const [childKey, childValue] = entries[i]!
      visit(childValue, childKey, [...path, childKey], depth + 1, i + 1, siblings)
    }
    if (shown < entries.length) {
      rows.push({ kind: 'more', id: `${id}\u0000more`, parentId: id, path, depth: depth + 1, shown, total: entries.length, posinset: siblings, setsize: siblings })
    }
    ancestors.pop()
  }

  visit(root, null, [], 0, 1, 1)
  return rows
}

/**
 * Ids of every container that opens down to `depth` levels (root = level 0), as
 * shown with `limits`. `depth: Infinity` is "expand all", still bounded by
 * `maxDepth` and by the children each container shows.
 */
export function expandedToDepth(root: unknown, depth: number, options: Omit<FlattenOptions, 'expanded'> = {}): Set<string> {
  const pageSize = options.pageSize ?? JSON_TREE_PAGE_SIZE
  const maxDepth = options.maxDepth ?? JSON_TREE_MAX_DEPTH
  const out = new Set<string>()
  const ancestors: object[] = []

  function visit(value: unknown, path: PathSegment[], level: number): void {
    const type = jsonType(value)
    if (!isContainer(type) || level >= depth || level >= maxDepth) return
    if (ancestors.includes(value as object)) return
    const id = formatPath(path)
    const entries = jsonChildren(value)
    if (entries.length === 0) return
    out.add(id)
    ancestors.push(value as object)
    const limit = Math.max(pageSize, options.limits?.get(id) ?? pageSize)
    for (const [key, child] of entries.slice(0, limit)) visit(child, [...path, key], level + 1)
    ancestors.pop()
  }

  visit(root, [], 0)
  return out
}

/** Text copied for "copy value": raw strings, pretty JSON for everything else. */
export function copyText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2) ?? String(value)
  } catch {
    return '[Circular]'
  }
}

/** One-line preview of a leaf value, as shown in the tree. */
export function previewValue(value: unknown, type: JsonType): string {
  switch (type) {
    case 'string':
      return JSON.stringify(value)
    case 'null':
      return 'null'
    case 'undefined':
      return 'undefined'
    case 'circular':
      return '[Circular]'
    case 'array':
      return `[${(value as unknown[]).length}]`
    case 'object':
      return `{${Object.keys(value as object).length}}`
    default:
      return String(value)
  }
}
