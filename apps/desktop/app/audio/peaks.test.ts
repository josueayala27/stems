import { describe, expect, it } from 'vitest'
import { parsePeaks, pickLevel, waveformColumns, type Peaks } from './peaks'

/** Build a peak file the way `stems-library` writes it. */
function encode(sampleRate: number, frames: number, levels: { framesPerPeak: number; peaks: [number, number][] }[]): ArrayBuffer {
  const data = levels.reduce((sum, level) => sum + level.peaks.length * 4, 0)
  const buffer = new ArrayBuffer(24 + levels.length * 8 + data)
  const view = new DataView(buffer)
  ;[...'STPK'].forEach((c, i) => view.setUint8(i, c.charCodeAt(0)))
  view.setUint16(4, 1, true)
  view.setUint32(8, sampleRate, true)
  view.setBigUint64(12, BigInt(frames), true)
  view.setUint32(20, levels.length, true)
  levels.forEach((level, i) => {
    view.setUint32(24 + i * 8, level.framesPerPeak, true)
    view.setUint32(28 + i * 8, level.peaks.length, true)
  })
  let offset = 24 + levels.length * 8
  for (const level of levels) {
    for (const [min, max] of level.peaks) {
      view.setInt16(offset, min, true)
      view.setInt16(offset + 2, max, true)
      offset += 4
    }
  }
  return buffer
}

const sample = (): Peaks =>
  parsePeaks(
    encode(48_000, 1_024, [
      { framesPerPeak: 256, peaks: [[-100, 100], [-32767, 0], [0, 32767], [-10, 10]] },
      { framesPerPeak: 1_024, peaks: [[-32767, 32767]] },
    ]),
  )

describe('parsePeaks', () => {
  it('reads the header and every level', () => {
    const peaks = sample()
    expect(peaks.sampleRate).toBe(48_000)
    expect(peaks.frames).toBe(1_024)
    expect(peaks.levels.map((level) => level.framesPerPeak)).toEqual([256, 1_024])
    expect([...peaks.levels[0]!.data]).toEqual([-100, 100, -32767, 0, 0, 32767, -10, 10])
  })

  it('rejects other files and truncated ones', () => {
    expect(() => parsePeaks(new ArrayBuffer(4))).toThrow('truncated')
    const riff = encode(48_000, 0, [])
    new DataView(riff).setUint8(0, 'R'.charCodeAt(0))
    expect(() => parsePeaks(riff)).toThrow('Not a peak file')
    const full = encode(48_000, 1_024, [{ framesPerPeak: 256, peaks: [[0, 1]] }])
    expect(() => parsePeaks(full.slice(0, full.byteLength - 1))).toThrow('truncated')
  })
})

describe('pickLevel', () => {
  it('uses the coarsest level with a peak per pixel', () => {
    const peaks = sample()
    expect(pickLevel(peaks, 100)!.framesPerPeak).toBe(256)
    expect(pickLevel(peaks, 512)!.framesPerPeak).toBe(256)
    expect(pickLevel(peaks, 2_000)!.framesPerPeak).toBe(1_024)
  })
})

describe('waveformColumns', () => {
  it('folds peaks into pixel columns', () => {
    // 512 frames per pixel: the 256-frame level, two peaks per column.
    const columns = waveformColumns(sample(), 0, 1_024, 2)
    expect([...columns].map((value) => Math.round(value * 32767))).toEqual([-32767, 100, -10, 32767])
    // 1 024 frames per pixel: the coarse level.
    expect([...waveformColumns(sample(), 0, 1_024, 1)]).toEqual([-1, 1])
  })

  it('draws zoomed in past the finest level by repeating its peaks', () => {
    const columns = waveformColumns(sample(), 256, 512, 4)
    for (let x = 0; x < 4; x++) {
      expect(columns[x * 2]).toBeCloseTo(-1)
      expect(columns[x * 2 + 1]).toBeCloseTo(0)
    }
  })

  it('is silent past the end of the track', () => {
    const columns = waveformColumns(sample(), 2_048, 4_096, 3)
    expect([...columns]).toEqual([0, 0, 0, 0, 0, 0])
  })
})
