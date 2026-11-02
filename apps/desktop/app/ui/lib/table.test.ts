import { describe, expect, it } from 'vitest'
import { nextSort, selectRange, sortRows, virtualWindow } from './table'

describe('nextSort', () => {
  it('cycles asc → desc → off and resets on a new key', () => {
    expect(nextSort(null, 'a')).toEqual({ key: 'a', direction: 'asc' })
    expect(nextSort({ key: 'a', direction: 'asc' }, 'a')).toEqual({ key: 'a', direction: 'desc' })
    expect(nextSort({ key: 'a', direction: 'desc' }, 'a')).toBeNull()
    expect(nextSort({ key: 'a', direction: 'desc' }, 'b')).toEqual({ key: 'b', direction: 'asc' })
  })
})

describe('sortRows', () => {
  const rows = [{ v: 'b10' }, { v: null }, { v: 'b2' }, { v: 'A' }]
  it('sorts naturally, case-insensitive, empties last', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual(['A', 'b2', 'b10', null])
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual(['b10', 'b2', 'A', null])
  })
  it('sorts numbers numerically and is stable', () => {
    const nums = [{ v: 2, id: 1 }, { v: 10, id: 2 }, { v: 2, id: 3 }]
    expect(sortRows(nums, (r) => r.v, 'asc').map((r) => r.id)).toEqual([1, 3, 2])
  })
})

describe('selectRange', () => {
  const keys = ['a', 'b', 'c', 'd', 'e']
  it('toggles one key without shift', () => {
    expect(selectRange(keys, [], 'c', null, false)).toEqual(['c'])
    expect(selectRange(keys, ['c'], 'c', 'c', false)).toEqual([])
  })
  it('selects the range between anchor and target with shift', () => {
    expect(selectRange(keys, ['b'], 'd', 'b', true)).toEqual(['b', 'c', 'd'])
    expect(selectRange(keys, ['d'], 'a', 'd', true)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('deselects the range when the target was selected', () => {
    expect(selectRange(keys, ['a', 'b', 'c', 'd'], 'c', 'a', true)).toEqual(['d'])
  })
  it('keeps selected keys that are not on this page', () => {
    expect(selectRange(keys, ['z'], 'a', null, false)).toEqual(['a', 'z'])
  })
})

describe('virtualWindow', () => {
  it('renders the visible rows plus overscan', () => {
    expect(virtualWindow(0, 320, 32, 1000, 8)).toEqual({ start: 0, end: 18, padTop: 0, padBottom: 982 * 32 })
    const w = virtualWindow(3200, 320, 32, 1000, 8)
    expect(w.start).toBe(92)
    expect(w.end).toBe(118)
    expect(w.padTop).toBe(92 * 32)
  })
  it('clamps at the end and handles empty lists', () => {
    const w = virtualWindow(1_000_000, 320, 32, 100, 8)
    expect(w.end).toBe(100)
    expect(w.padBottom).toBe(0)
    expect(virtualWindow(0, 320, 32, 0)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
  })
})
