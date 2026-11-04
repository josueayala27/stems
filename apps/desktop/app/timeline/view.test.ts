import { createTempoGrid } from '@stems/core'
import { describe, expect, it } from 'vitest'
import { clampView, fit, follow, MIN_SCALE, rulerTicks, sampleAt, scrollBy, wheel, xAt, zoomAt } from './view'

const LENGTH = 48_000 * 240
const WIDTH = 1_000
// 120 bpm 4/4 at 48 kHz: a bar is 96 000 samples.
const grid = createTempoGrid({ sampleRate: 48_000, bpm: 120, timeSignature: { numerator: 4, denominator: 4 } })

describe('timeline view', () => {
  it('fits the song and never zooms out past it', () => {
    expect(fit(LENGTH, WIDTH)).toEqual({ start: 0, scale: LENGTH / WIDTH })
    expect(zoomAt(fit(LENGTH, WIDTH), 0.5, 500, LENGTH, WIDTH)).toEqual(fit(LENGTH, WIDTH))
  })

  it('zooms around the pointer', () => {
    const view = fit(LENGTH, WIDTH)
    const anchor = sampleAt(view, 300)
    const zoomed = zoomAt(view, 4, 300, LENGTH, WIDTH)
    expect(zoomed.scale).toBe(view.scale / 4)
    expect(sampleAt(zoomed, 300)).toBeCloseTo(anchor)
    expect(zoomAt(zoomed, 1e9, 300, LENGTH, WIDTH).scale).toBe(MIN_SCALE)
  })

  it('scrolls and clamps to the song', () => {
    const view = { start: 0, scale: 1_000 }
    expect(scrollBy(view, 100, LENGTH, WIDTH).start).toBe(100_000)
    expect(scrollBy(view, -100, LENGTH, WIDTH).start).toBe(0)
    expect(clampView({ start: LENGTH, scale: 1_000 }, LENGTH, WIDTH).start).toBe(LENGTH - 1_000 * WIDTH)
    expect(xAt(view, 50_000)).toBe(50)
  })

  it('maps wheel input like a DAW', () => {
    const view = { start: 1_000_000, scale: 1_000 }
    const base = { deltaX: 0, deltaY: 0, ctrlKey: false, metaKey: false, shiftKey: false }
    expect(wheel(view, { ...base, deltaY: 40 }, 0, LENGTH, WIDTH)).toBeNull()
    expect(wheel(view, { ...base, deltaX: 3, deltaY: 40 }, 0, LENGTH, WIDTH)).toBeNull()
    expect(wheel(view, { ...base, deltaX: 10 }, 0, LENGTH, WIDTH)?.start).toBe(1_010_000)
    expect(wheel(view, { ...base, deltaY: 10, shiftKey: true }, 0, LENGTH, WIDTH)?.start).toBe(1_010_000)
    expect(wheel(view, { ...base, deltaY: -50, ctrlKey: true }, 500, LENGTH, WIDTH)!.scale).toBeLessThan(1_000)
  })

  it('turns the page when the play head reaches 90% of the view', () => {
    const view = { start: 0, scale: 1_000 }
    expect(follow(view, 500_000, LENGTH, WIDTH)).toBe(view)
    expect(follow(view, 950_000, LENGTH, WIDTH).start).toBe(900_000)
    expect(follow({ start: 2_000_000, scale: 1_000 }, 100_000, LENGTH, WIDTH).start).toBe(50_000)
  })

  it('labels bars at a readable step and adds beats when zoomed in', () => {
    const whole = rulerTicks(grid, fit(LENGTH, WIDTH), WIDTH, LENGTH)
    const labels = whole.filter((tick) => tick.label !== null).map((tick) => tick.label)
    expect(labels.slice(0, 3)).toEqual([1, 9, 17])
    expect(whole.some((tick) => tick.kind === 'beat')).toBe(false)
    const close = rulerTicks(grid, { start: 96_000, scale: 200 }, WIDTH, LENGTH)
    expect(close[0]).toMatchObject({ sample: 96_000, label: 2, kind: 'bar' })
    expect(close.filter((tick) => tick.kind === 'beat').slice(0, 3).map((tick) => tick.sample)).toEqual([120_000, 144_000, 168_000])
  })
})
