// Timeline view maths shared by Play and Arrange: a window onto the song, zoomed and scrolled like
// a DAW. Positions are song samples. Pure functions; `useTimeline.ts` holds the state.
import { barBeatToSamples, samplesToBarBeat, type TempoGrid } from '@stems/core'

export interface View {
  /** First visible sample. */
  start: number
  /** Samples per pixel. */
  scale: number
}

/** Most zoomed in: 16 samples a pixel (3 000 px a second at 48 kHz). */
export const MIN_SCALE = 16
/** Labels on the ruler stay at least this far apart. */
const MIN_LABEL_PX = 56
/** Beat lines show once a bar is this wide. */
const BEAT_LINES_PX = 120

/** The widest scale: the whole song in `width`. */
export function fitScale(length: number, width: number): number {
  return Math.max(MIN_SCALE, length / Math.max(1, width))
}

export function clampView(view: View, length: number, width: number): View {
  const scale = Math.min(Math.max(view.scale, MIN_SCALE), fitScale(length, width))
  const visible = scale * Math.max(1, width)
  const start = Math.min(Math.max(0, view.start), Math.max(0, length - visible))
  return { start, scale }
}

export function fit(length: number, width: number): View {
  return { start: 0, scale: fitScale(length, width) }
}

export function viewEnd(view: View, width: number): number {
  return view.start + view.scale * width
}

export function sampleAt(view: View, x: number): number {
  return view.start + x * view.scale
}

export function xAt(view: View, sample: number): number {
  return (sample - view.start) / view.scale
}

/** Zoom by `factor` (>1 zooms in) keeping the sample under `x` where it is. */
export function zoomAt(view: View, factor: number, x: number, length: number, width: number): View {
  const anchor = sampleAt(view, x)
  const scale = view.scale / factor
  return clampView({ start: anchor - x * scale, scale }, length, width)
}

export function scrollBy(view: View, pixels: number, length: number, width: number): View {
  return clampView({ ...view, start: view.start + pixels * view.scale }, length, width)
}

/** Centre the view on `sample` without changing the zoom. */
export function centreOn(view: View, sample: number, length: number, width: number): View {
  return clampView({ ...view, start: sample - (view.scale * width) / 2 }, length, width)
}

/**
 * Follow the play head like a DAW: when it leaves the visible window, or passes 90% of it, the
 * view turns the page so the play head sits near the left edge.
 */
export function follow(view: View, playhead: number, length: number, width: number): View {
  const end = viewEnd(view, width)
  if (playhead >= view.start && playhead < view.start + (end - view.start) * 0.9) return view
  return clampView({ ...view, start: playhead - view.scale * width * 0.05 }, length, width)
}

/** Wheel input to a view change. Pinch (ctrlKey on macOS) and ⌘/Ctrl zoom; horizontal and Shift scroll. */
export function wheel(
  view: View,
  event: { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  x: number,
  length: number,
  width: number,
): View | null {
  if (event.ctrlKey || event.metaKey) return zoomAt(view, Math.exp(-event.deltaY * 0.01), x, length, width)
  const horizontal = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX
  if (Math.abs(horizontal) < 0.5) return null
  return scrollBy(view, horizontal, length, width)
}

export interface Tick {
  sample: number
  x: number
  /** Bar number on a labelled bar line; null on beat and unlabelled bar lines. */
  label: number | null
  kind: 'bar' | 'beat'
}

/** Bar and beat lines across the view, labelled at a step that keeps labels readable. */
export function rulerTicks(grid: TempoGrid, view: View, width: number, length: number): Tick[] {
  const end = Math.min(viewEnd(view, width), length)
  const firstBar = samplesToBarBeat(grid, view.start).bar
  const barPx = (barBeatToSamples(grid, { bar: firstBar + 1 }) - barBeatToSamples(grid, { bar: firstBar })) / view.scale
  const step = [1, 2, 4, 8, 16, 32, 64, 128].find((candidate) => candidate * barPx >= MIN_LABEL_PX) ?? 256
  const ticks: Tick[] = []
  for (let bar = firstBar; ticks.length < 2_000; bar++) {
    const sample = barBeatToSamples(grid, { bar })
    if (sample > end) break
    const next = barBeatToSamples(grid, { bar: bar + 1 })
    if (sample >= view.start) ticks.push({ sample, x: xAt(view, sample), label: (bar - 1) % step === 0 ? bar : null, kind: 'bar' })
    if ((next - sample) / view.scale >= BEAT_LINES_PX) {
      for (let beat = 2; beat <= 32; beat++) {
        const at = barBeatToSamples(grid, { bar, beat })
        if (at >= next) break
        if (at >= view.start && at <= end) ticks.push({ sample: at, x: xAt(view, at), label: null, kind: 'beat' })
      }
    }
  }
  return ticks
}
