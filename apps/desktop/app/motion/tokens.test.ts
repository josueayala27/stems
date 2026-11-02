import { describe, expect, it } from 'vitest'
import { token } from 'styled-system/tokens'
import { cubicBezierToCss, cubicBezierToPath, durations, easeCurves, secondsToCss, type DurationName, type EaseName } from './tokens'

describe('motion tokens', () => {
  it('mirror Panda durations', () => {
    for (const name of Object.keys(durations) as DurationName[]) {
      expect(secondsToCss(durations[name])).toBe(token(`durations.${name}`))
    }
  })

  it('mirror Panda easings', () => {
    for (const name of Object.keys(easeCurves) as EaseName[]) {
      expect(cubicBezierToCss(easeCurves[name])).toBe(token(`easings.${name}`))
    }
  })

  it('builds CustomEase path data from a cubic-bezier', () => {
    expect(cubicBezierToPath([0.2, 0, 0, 1])).toBe('M0,0 C0.2,0 0,1 1,1')
  })
})
