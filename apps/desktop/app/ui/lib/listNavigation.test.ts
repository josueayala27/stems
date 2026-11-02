import { describe, expect, it } from 'vitest'
import { edgeIndex, stepIndex, typeaheadIndex } from './listNavigation'

const items = [{ label: 'Copy' }, { label: 'Cut', disabled: true }, { label: 'Paste' }, { label: 'Pin' }]

describe('list navigation', () => {
  it('steps over disabled items and loops', () => {
    expect(stepIndex(items, 0, 1)).toBe(2)
    expect(stepIndex(items, 3, 1)).toBe(0)
    expect(stepIndex(items, 0, -1)).toBe(3)
    expect(stepIndex(items, -1, 1)).toBe(0)
  })

  it('stops at the edges without loop', () => {
    expect(stepIndex(items, 3, 1, false)).toBe(3)
    expect(stepIndex(items, 0, -1, false)).toBe(0)
  })

  it('handles empty and all-disabled lists', () => {
    expect(stepIndex([], 0, 1)).toBe(-1)
    expect(stepIndex([{ disabled: true }], -1, 1)).toBe(-1)
    expect(edgeIndex([{ disabled: true }], 'first')).toBe(-1)
  })

  it('finds edges', () => {
    expect(edgeIndex(items, 'first')).toBe(0)
    expect(edgeIndex([...items, { label: 'x', disabled: true }], 'last')).toBe(3)
  })

  it('matches typeahead and cycles single letters', () => {
    expect(typeaheadIndex(items, 'p', 0)).toBe(2)
    expect(typeaheadIndex(items, 'p', 2)).toBe(3)
    expect(typeaheadIndex(items, 'p', 3)).toBe(2)
    expect(typeaheadIndex(items, 'pi', 0)).toBe(3)
    expect(typeaheadIndex(items, 'cu', 0)).toBe(-1)
  })
})
