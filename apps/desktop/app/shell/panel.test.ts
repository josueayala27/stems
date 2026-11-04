import { describe, expect, it } from 'vitest'
import { readPanel } from './panel'

describe('readPanel', () => {
  const fallback = { width: 260, hidden: false }
  it('merges saved state over the defaults and clamps the width', () => {
    expect(readPanel(null, fallback, 180, 420)).toEqual(fallback)
    expect(readPanel('{"width":999,"hidden":true}', fallback, 180, 420)).toEqual({ width: 420, hidden: true })
    expect(readPanel('{"width":"x"}', fallback, 180, 420)).toEqual(fallback)
    expect(readPanel('nope', fallback, 180, 420)).toEqual(fallback)
  })
})
