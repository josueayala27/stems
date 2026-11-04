import { describe, expect, it } from 'vitest'
import { songFromImport } from '~/data/importSong'
import type { EngineState } from './engine'
import { defaultRig } from '@stems/core'
import { busesChanged, deviceChanged, engineSections, outputConfig, sectionIndexAt, skipTarget, slowFieldsChanged, type Span } from './player'

const sections: Span[] = [
  { name: 'Intro', start: 0, end: 100 },
  { name: 'Verse', start: 100, end: 200 },
  { name: 'Chorus', start: 200, end: 300 },
  { name: 'Outro', start: 300, end: 400 },
]

describe('sections', () => {
  it('finds the section under the play head', () => {
    expect(sectionIndexAt(sections, 0)).toBe(0)
    expect(sectionIndexAt(sections, 199)).toBe(1)
    expect(sectionIndexAt(sections, 400)).toBe(-1)
  })

  it('skips the next section', () => {
    expect(skipTarget(sections, 50)?.name).toBe('Chorus')
    expect(skipTarget(sections, 250)).toBeNull()
  })

  it('converts sections to engine frames, sorted', () => {
    const song = {
      ...songFromImport({ title: 'S', sampleRate: 44_100, durationSamples: 441_000, tempo: null, tracks: [] }),
      sections: [
        { id: 'b', name: 'Chorus', startSample: 44_100, endSample: 88_200, color: 'red', loopable: true },
        { id: 'a', name: 'Verse', startSample: 0, endSample: 44_100, color: 'blue', loopable: true },
      ],
    }
    expect(engineSections(song, 48_000)).toEqual([
      { name: 'Verse', start: 0, end: 48_000 },
      { name: 'Chorus', start: 48_000, end: 96_000 },
    ])
  })
})

describe('slowFieldsChanged', () => {
  const base = { playing: true, position: 0, clock: 0, meters: [0], songTag: 1, armed: 'none', cpuLoad: 0.1 } as unknown as EngineState
  it('ignores the clock and meters but not transport changes', () => {
    expect(slowFieldsChanged(null, base)).toBe(true)
    expect(slowFieldsChanged(base, { ...base, position: 480, clock: 480, meters: [0.5], cpuLoad: 0.2 })).toBe(false)
    expect(slowFieldsChanged(base, { ...base, playing: false })).toBe(true)
    expect(slowFieldsChanged(base, { ...base, armed: 'jump' })).toBe(true)
  })
})

describe('rig changes', () => {
  const rig = defaultRig(16, () => 'id')

  it('reopens the device only when the device, rate or buffer change', () => {
    expect(deviceChanged(null, rig)).toBe(true)
    expect(deviceChanged(rig, { ...rig, name: 'Renamed' })).toBe(false)
    expect(deviceChanged(rig, { ...rig, bufferSize: 128 })).toBe(true)
    expect(deviceChanged(rig, { ...rig, deviceId: 'usb' })).toBe(true)
  })

  it('resends track buses when bus names or order change', () => {
    expect(busesChanged(rig, { ...rig, buses: rig.buses.map((bus) => ({ ...bus, gain: 0.5 })) })).toBe(false)
    expect(busesChanged(rig, { ...rig, buses: [...rig.buses].reverse() })).toBe(true)
    expect(busesChanged(rig, { ...rig, buses: rig.buses.slice(1) })).toBe(true)
  })

  it('opens the rig device at its rate and buffer', () => {
    expect(outputConfig({ ...rig, deviceId: 'usb', sampleRate: 96_000, bufferSize: 128 })).toEqual({ deviceId: 'usb', sampleRate: 96_000, bufferSize: 128 })
  })
})
