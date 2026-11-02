import { describe, expect, it } from 'vitest'
import { parsePlacement, placementMotion } from './placement'

describe('placementMotion', () => {
  it('grows from the edge facing the anchor', () => {
    expect(placementMotion('bottom', 4)).toEqual({ origin: 'center top', x: 0, y: -4 })
    expect(placementMotion('bottom-start', 4).origin).toBe('left top')
    expect(placementMotion('top-end', 4)).toEqual({ origin: 'right bottom', x: 0, y: 4 })
    expect(placementMotion('right-start', 2)).toEqual({ origin: 'left top', x: -2, y: 0 })
    expect(placementMotion('left', 2)).toEqual({ origin: 'right center', x: 2, y: 0 })
  })

  it('falls back to bottom for unknown input', () => {
    expect(parsePlacement(undefined)).toEqual({ side: 'bottom', align: null })
    expect(parsePlacement('weird-middle')).toEqual({ side: 'bottom', align: null })
  })
})
