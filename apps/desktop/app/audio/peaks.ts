// Reader for the peak files `stems-library` writes at import (`crates/stems-library/src/peaks.rs`).
// Layout, little endian: "STPK", u16 version, u16 reserved, u32 sampleRate, u64 frames,
// u32 levelCount, levelCount × (u32 framesPerPeak, u32 peakCount), then each level's
// peakCount × (i16 min, i16 max). ±32767 is full scale.

export interface PeakLevel {
  framesPerPeak: number
  /** min, max, min, max… */
  data: Int16Array
}

export interface Peaks {
  sampleRate: number
  frames: number
  /** Finest first. */
  levels: PeakLevel[]
}

const MAGIC = 'STPK'
const VERSION = 1

export function parsePeaks(buffer: ArrayBuffer): Peaks {
  const view = new DataView(buffer)
  if (buffer.byteLength < 24) throw new Error('Peak file is truncated.')
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (magic !== MAGIC) throw new Error('Not a peak file.')
  if (view.getUint16(4, true) !== VERSION) throw new Error('Unknown peak file version.')
  const sampleRate = view.getUint32(8, true)
  const frames = Number(view.getBigUint64(12, true))
  const count = view.getUint32(20, true)
  let offset = 24 + count * 8
  if (buffer.byteLength < offset) throw new Error('Peak file is truncated.')
  const levels: PeakLevel[] = []
  for (let index = 0; index < count; index++) {
    const framesPerPeak = view.getUint32(24 + index * 8, true)
    const peakCount = view.getUint32(28 + index * 8, true)
    const length = peakCount * 2
    if (buffer.byteLength < offset + length * 2) throw new Error('Peak file is truncated.')
    // Copy: the data may not be 2-byte aligned for a direct view.
    const data = new Int16Array(length)
    for (let i = 0; i < length; i++) data[i] = view.getInt16(offset + i * 2, true)
    levels.push({ framesPerPeak, data })
    offset += length * 2
  }
  return { sampleRate, frames, levels }
}

/** The coarsest level that still has at least one peak per pixel. */
export function pickLevel(peaks: Peaks, framesPerPixel: number): PeakLevel | null {
  let chosen: PeakLevel | null = null
  for (const level of peaks.levels) {
    if (!chosen || level.framesPerPeak <= framesPerPixel) chosen = level
  }
  return chosen
}

/**
 * Min and max per pixel column for frames `start..end`, as values in −1…1: `[min0, max0, min1, max1…]`.
 * Columns past the end of the track are 0.
 */
export function waveformColumns(peaks: Peaks, start: number, end: number, width: number): Float32Array {
  const columns = new Float32Array(Math.max(0, width) * 2)
  if (width <= 0 || end <= start) return columns
  const framesPerPixel = (end - start) / width
  const level = pickLevel(peaks, framesPerPixel)
  if (!level) return columns
  const peakCount = level.data.length / 2
  for (let x = 0; x < width; x++) {
    const from = start + x * framesPerPixel
    const to = from + framesPerPixel
    const first = Math.floor(from / level.framesPerPeak)
    // Past the end, `last < first` and the column stays silent.
    const last = Math.min(peakCount - 1, Math.ceil(to / level.framesPerPeak) - 1)
    let min = 0
    let max = 0
    let seen = false
    for (let peak = Math.max(0, first); peak <= last; peak++) {
      const low = level.data[peak * 2]! / 32767
      const high = level.data[peak * 2 + 1]! / 32767
      if (!seen) {
        min = low
        max = high
        seen = true
      } else {
        min = Math.min(min, low)
        max = Math.max(max, high)
      }
    }
    columns[x * 2] = min
    columns[x * 2 + 1] = max
  }
  return columns
}
