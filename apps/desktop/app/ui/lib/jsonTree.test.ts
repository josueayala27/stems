import { describe, expect, it } from 'vitest'
import { formatPath, getAtPath, moveItem, parsePath, setAtPath } from './jsonPath'
import { copyText, expandedToDepth, flattenJson, jsonType, previewValue, type JsonNodeRow } from './jsonTree'

describe('formatPath', () => {
  it('writes identifiers with dots and indexes with brackets', () => {
    expect(formatPath(['a', 'b', 0, 'c'])).toBe('a.b[0].c')
    expect(formatPath([0, 'x'])).toBe('[0].x')
    expect(formatPath([])).toBe('')
  })

  it('quotes keys that are not identifiers', () => {
    expect(formatPath(['a', 'odd key', '1x'])).toBe('a["odd key"]["1x"]')
  })

  it('prepends a base path', () => {
    expect(formatPath(['items', 2], 'query.result')).toBe('query.result.items[2]')
    expect(formatPath([], 'query')).toBe('query')
  })
})

describe('getAtPath / setAtPath', () => {
  it('reads nested values', () => {
    expect(getAtPath({ a: [{ b: 1 }] }, ['a', 0, 'b'])).toBe(1)
    expect(getAtPath({ a: 1 }, ['a', 'b'])).toBeUndefined()
  })

  it('writes without mutating and creates containers', () => {
    const root = { a: { b: 1 } }
    const next = setAtPath(root, ['a', 'c', 0], 'x')
    expect(next).toEqual({ a: { b: 1, c: ['x'] } })
    expect(root).toEqual({ a: { b: 1 } })
  })

  it('removes object keys set to undefined', () => {
    expect(setAtPath({ a: 1, b: 2 }, ['a'], undefined)).toEqual({ b: 2 })
  })
})

describe('moveItem', () => {
  it('moves to the final index', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a'], 3, 0)).toEqual(['a'])
  })
})

describe('flattenJson', () => {
  const value = { name: 'Ada', tags: ['x', 'y'], meta: { active: true, score: null } }

  it('shows only the root when nothing is open', () => {
    const rows = flattenJson(value, { expanded: new Set() })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'node', id: '', type: 'object', size: 3, expandable: true, expanded: false })
  })

  it('lists children of open containers with ARIA positions', () => {
    const rows = flattenJson(value, { expanded: new Set(['', 'tags']) }) as JsonNodeRow[]
    expect(rows.map((r) => r.id)).toEqual(['', 'name', 'tags', 'tags[0]', 'tags[1]', 'meta'])
    expect(rows[2]).toMatchObject({ depth: 1, posinset: 2, setsize: 3, expanded: true })
    expect(rows[3]).toMatchObject({ key: 0, depth: 2, type: 'string' })
  })

  it('cuts long arrays behind a show-more row', () => {
    const list = Array.from({ length: 250 }, (_, i) => i)
    const rows = flattenJson(list, { expanded: new Set(['']), pageSize: 100 })
    expect(rows).toHaveLength(102)
    expect(rows.at(-1)).toMatchObject({ kind: 'more', parentId: '', shown: 100, total: 250, posinset: 101, setsize: 101 })
    const more = flattenJson(list, { expanded: new Set(['']), pageSize: 100, limits: new Map([['', 200]]) })
    expect(more).toHaveLength(202)
  })

  it('stops at the depth limit', () => {
    const deep = { a: { b: { c: 1 } } }
    const rows = flattenJson(deep, { expanded: new Set(['', 'a', 'a.b']), maxDepth: 2 }) as JsonNodeRow[]
    expect(rows.map((r) => r.id)).toEqual(['', 'a', 'a.b'])
    expect(rows[2]).toMatchObject({ expandable: false, depthLimited: true })
  })

  it('marks circular references', () => {
    const loop: Record<string, unknown> = { a: 1 }
    loop.self = loop
    const rows = flattenJson(loop, { expanded: new Set(['', 'self']) }) as JsonNodeRow[]
    expect(rows.find((r) => r.id === 'self')).toMatchObject({ type: 'circular', expandable: false })
  })
})

describe('expandedToDepth', () => {
  it('opens containers down to a level', () => {
    const value = { a: { b: { c: 1 } }, d: [] }
    expect([...expandedToDepth(value, 1)]).toEqual([''])
    expect([...expandedToDepth(value, 2)]).toEqual(['', 'a'])
    expect([...expandedToDepth(value, Infinity)]).toEqual(['', 'a', 'a.b'])
    expect(expandedToDepth(value, 0).size).toBe(0)
  })
})

describe('helpers', () => {
  it('types values', () => {
    expect([null, [], {}, 's', 1, true, undefined].map(jsonType)).toEqual(['null', 'array', 'object', 'string', 'number', 'boolean', 'undefined'])
  })

  it('copies strings raw and the rest as JSON', () => {
    expect(copyText('hi')).toBe('hi')
    expect(copyText({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('previews leaves and containers', () => {
    expect(previewValue('a', 'string')).toBe('"a"')
    expect(previewValue([1, 2], 'array')).toBe('[2]')
    expect(previewValue({ a: 1 }, 'object')).toBe('{1}')
  })
})

describe('parsePath', () => {
  it('reads what formatPath writes', () => {
    const cases: Array<Array<string | number>> = [[], ['a'], ['a', 'b', 0, 'c'], [0, 'x'], ['odd key', 2, 'q"uote'], ['$x', '_y']]
    for (const segments of cases) expect(parsePath(formatPath(segments))).toEqual(segments)
    expect(parsePath('queries.products.data[0].title')).toEqual(['queries', 'products', 'data', 0, 'title'])
  })

  it('rejects malformed paths', () => {
    for (const path of ['.a', 'a..b', 'a.', 'a[', 'a[x]', 'a b', '1a', 'a["x"', "a['x']"]) expect(parsePath(path)).toBeNull()
  })
})
