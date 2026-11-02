import type { Section, TempoPoint, TimeSignature } from '@stems/schema'

/**
 * Quantize maths on a tempo map. Pure functions; the Rust engine owns the clock and runs the same maths in M1.
 *
 * Conventions:
 * - Positions are sample indexes from song start.
 * - `bpm` counts beats of the time signature's denominator (in 6/8 at 120 bpm, eighth notes tick at 120 per minute).
 * - Tempo changes are expected on bar lines. Bars and beats are 1-based in `BarBeat`, as musicians count them.
 */

export interface BarBeat {
  /** 1-based bar. */
  bar: number
  /** 1-based beat within the bar. */
  beat: number
  /** Fraction of the beat already played, in [0, 1). */
  fraction: number
}

export type QuantizeTarget = 'now' | 'beat' | 'bar' | 'section' | 'end'

interface Segment {
  startSample: number
  endSample: number
  bpm: number
  timeSignature: TimeSignature
  /** 0-based bar index where this segment starts. */
  startBar: number
  samplesPerBeat: number
}

export interface TempoGrid {
  sampleRate: number
  segments: Segment[]
}

/**
 * Builds the beat grid for a song. With an empty tempo map the song tempo applies from sample 0; a map that starts
 * after sample 0 is preceded by the song tempo.
 */
export function createTempoGrid(input: {
  sampleRate: number
  bpm: number
  timeSignature: TimeSignature
  tempoMap?: readonly TempoPoint[]
}): TempoGrid {
  if (input.sampleRate <= 0) throw new RangeError('sampleRate must be positive')
  const points: TempoPoint[] = [...(input.tempoMap ?? [])].sort((a, b) => a.sample - b.sample)
  if (points[0]?.sample !== 0) points.unshift({ sample: 0, bpm: input.bpm, timeSignature: input.timeSignature })

  const segments: Segment[] = []
  let startBar = 0
  points.forEach((point, index) => {
    const next = points[index + 1]
    const samplesPerBeat = (input.sampleRate * 60) / point.bpm
    const endSample = next ? next.sample : Number.POSITIVE_INFINITY
    segments.push({ startSample: point.sample, endSample, bpm: point.bpm, timeSignature: point.timeSignature, startBar, samplesPerBeat })
    if (next) startBar += Math.round((next.sample - point.sample) / samplesPerBeat / point.timeSignature.numerator)
  })
  return { sampleRate: input.sampleRate, segments }
}

/** Last segment that `starts` at or before the position; the first segment otherwise. */
function lastSegment(grid: TempoGrid, starts: (segment: Segment) => boolean): Segment {
  let found = grid.segments[0]
  for (const segment of grid.segments) if (starts(segment)) found = segment
  if (!found) throw new Error('empty tempo grid')
  return found
}

function segmentAtSample(grid: TempoGrid, sample: number): Segment {
  return lastSegment(grid, (segment) => segment.startSample <= sample)
}

function segmentAtBar(grid: TempoGrid, barIndex: number): Segment {
  return lastSegment(grid, (segment) => segment.startBar <= barIndex)
}

/** Sample position to 1-based bar.beat. */
export function samplesToBarBeat(grid: TempoGrid, sample: number): BarBeat {
  const segment = segmentAtSample(grid, Math.max(0, sample))
  const beats = (Math.max(0, sample) - segment.startSample) / segment.samplesPerBeat
  const wholeBeats = Math.floor(beats + 1e-9)
  const numerator = segment.timeSignature.numerator
  return {
    bar: segment.startBar + Math.floor(wholeBeats / numerator) + 1,
    beat: (wholeBeats % numerator) + 1,
    fraction: Math.max(0, beats - wholeBeats),
  }
}

/** 1-based bar.beat (plus an optional beat fraction) to the nearest sample. */
export function barBeatToSamples(grid: TempoGrid, position: { bar: number; beat?: number; fraction?: number }): number {
  if (position.bar < 1) throw new RangeError('bar is 1-based')
  const barIndex = position.bar - 1
  const segment = segmentAtBar(grid, barIndex)
  const beatsIntoSegment = (barIndex - segment.startBar) * segment.timeSignature.numerator + ((position.beat ?? 1) - 1) + (position.fraction ?? 0)
  return Math.round(segment.startSample + beatsIntoSegment * segment.samplesPerBeat)
}

function nextGridLine(grid: TempoGrid, sample: number, unit: 'beat' | 'bar'): number {
  const segment = segmentAtSample(grid, sample)
  const step = unit === 'beat' ? segment.samplesPerBeat : segment.samplesPerBeat * segment.timeSignature.numerator
  const offset = sample - segment.startSample
  // A position already on a line moves to the next one: quantized commands never fire in the past or "now".
  const steps = Math.floor(offset / step + 1e-9) + 1
  const candidate = Math.round(segment.startSample + steps * step)
  return Math.min(candidate, segment.endSample)
}

/**
 * The sample where a command issued at `sample` takes effect.
 * `section` is the end of the section under the play head (or the next bar outside any section);
 * `end` is the song end.
 */
export function nextQuantizeBoundary(
  grid: TempoGrid,
  sample: number,
  target: QuantizeTarget,
  context: { sections?: readonly Pick<Section, 'startSample' | 'endSample'>[]; durationSamples?: number } = {},
): number {
  switch (target) {
    case 'now':
      return sample
    case 'beat':
      return nextGridLine(grid, sample, 'beat')
    case 'bar':
      return nextGridLine(grid, sample, 'bar')
    case 'section': {
      const section = context.sections?.find((s) => s.startSample <= sample && sample < s.endSample)
      return section ? section.endSample : nextGridLine(grid, sample, 'bar')
    }
    case 'end':
      return Math.max(sample, context.durationSamples ?? sample)
  }
}

/** Formats a position the way the transport shows it: `12.3`. */
export function formatBarBeat(position: BarBeat): string {
  return `${position.bar}.${position.beat}`
}
