import { rigSchema, songSchema, type Rig } from '@stems/schema'
import { describe, expect, it } from 'vitest'
import {
  addBus,
  channelTargets,
  defaultRig,
  formatTargets,
  removeBus,
  renameBus,
  routingDoc,
  routingWarnings,
  setChannels,
  toggleChannel,
  updateBus,
} from './routing'

let counter = 0
const id = () => `id${++counter}`

function tourRig(): Rig {
  return rigSchema.parse({
    id: 'r',
    name: 'Tour',
    bufferSize: 128,
    buses: [
      { id: 'b1', name: 'FOH', foh: true },
      { id: 'b2', name: 'IEM' },
      { id: 'b3', name: 'Click' },
    ],
    routing: [
      { bus: 'FOH', channels: [0, 1] },
      { bus: 'IEM', channels: [2, 3] },
      { bus: 'Click', channels: [4] },
    ],
    clickBus: 'Click',
    guideBus: 'IEM',
  })
}

describe('channelTargets', () => {
  it('pairs channels and folds a trailing one to mono, like the engine', () => {
    expect(channelTargets([0, 1], 2)).toEqual([{ kind: 'stereo', left: 0, right: 1 }])
    expect(channelTargets([0, 1, 4, 5, 7], 8)).toEqual([
      { kind: 'stereo', left: 0, right: 1 },
      { kind: 'stereo', left: 4, right: 5 },
      { kind: 'mono', channel: 7 },
    ])
    expect(channelTargets([0, 1], 1)).toEqual([{ kind: 'mono', channel: 0 }])
    expect(channelTargets([2, 3], 2)).toEqual([])
  })

  it('prints 1-based channels', () => {
    expect(formatTargets(channelTargets([0, 1, 8], 16))).toBe('1/2 · 9 mono')
    expect(formatTargets([])).toBe('Not routed')
  })
})

describe('toggleChannel', () => {
  it('keeps channels sorted and caps them at eight', () => {
    expect(toggleChannel([3], 1)).toEqual([1, 3])
    expect(toggleChannel([1, 3], 3)).toEqual([1])
    expect(toggleChannel([0, 1, 2, 3, 4, 5, 6, 7], 9)).toHaveLength(8)
  })
})

describe('routingDoc', () => {
  it('indexes buses and resolves the role buses by name', () => {
    expect(routingDoc(tourRig())).toEqual({
      buses: [
        { gain: 1, mute: false, channels: [0, 1] },
        { gain: 1, mute: false, channels: [2, 3] },
        { gain: 1, mute: false, channels: [4] },
      ],
      stemBus: 0,
      clickBus: 2,
      guideBus: 1,
      padBus: 0,
      timecodeBus: null,
    })
  })

  it('sends timecode nowhere when its bus is unset or missing', () => {
    expect(routingDoc({ ...tourRig(), timecodeBus: 'Click' }).timecodeBus).toBe(2)
    expect(routingDoc({ ...tourRig(), timecodeBus: 'Gone' }).timecodeBus).toBeNull()
  })

  it('falls back to the first bus for unknown names', () => {
    const doc = routingDoc({ ...tourRig(), clickBus: 'Nope', padBus: 'Nope' })
    expect(doc.clickBus).toBe(0)
    expect(doc.padBus).toBe(0)
  })
})

describe('routingWarnings', () => {
  it('is quiet for a safe rig', () => {
    expect(routingWarnings(tourRig(), 16)).toEqual([])
  })

  it('warns when the click bus is front of house', () => {
    const rig = { ...tourRig(), clickBus: 'FOH' }
    expect(routingWarnings(rig, 16)).toEqual([{ bus: 'FOH', message: 'The click plays into FOH, a front-of-house bus.' }])
  })

  it('warns when the guide shares an output with front of house, on this device only', () => {
    const rig = setChannels(tourRig(), 'IEM', [1, 2])
    expect(routingWarnings(rig, 16)[0]?.message).toBe('The guide on IEM shares output 2 with front of house.')
    const far = setChannels(setChannels(tourRig(), 'FOH', [0, 1, 6]), 'IEM', [6])
    expect(routingWarnings(far, 4)).toEqual([])
  })

  it('warns when timecode reaches front of house or shares the click bus', () => {
    expect(routingWarnings({ ...tourRig(), timecodeBus: 'FOH' }, 16)[0]?.message).toBe('Timecode plays into FOH, a front-of-house bus.')
    expect(routingWarnings({ ...tourRig(), timecodeBus: 'Click' }, 16)[0]?.message).toBe(
      'Timecode shares Click with the click or guide: give LTC a bus of its own.',
    )
  })

  it('ignores a muted bus and checks click and guide tracks of the song', () => {
    expect(routingWarnings(updateBus({ ...tourRig(), clickBus: 'FOH' }, 'FOH', { mute: true }), 16)).toEqual([])
    const song = songSchema.parse({
      id: 's',
      title: 'Song',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      durationSamples: 0,
      sampleRate: 48_000,
      tracks: [{ id: 't', name: 'Clicks', file: 'c.wav', hash: 'h', kind: 'click', color: '#fff', defaultBus: 'FOH' }],
    })
    expect(routingWarnings(tourRig(), 16, song)).toEqual([{ bus: 'FOH', message: 'Track “Clicks” plays into FOH, a front-of-house bus.' }])
  })
})

describe('defaultRig', () => {
  it('splits FOH and IEM on four outputs or more', () => {
    const rig = rigSchema.parse(defaultRig(16, id))
    expect(rig.buses.map((bus) => bus.name)).toEqual(['FOH', 'IEM'])
    expect(routingDoc(rig).clickBus).toBe(1)
    expect(routingWarnings(rig, 16)).toEqual([])
  })

  it('uses one main pair on a stereo device', () => {
    const rig = rigSchema.parse(defaultRig(2, id))
    expect(rig.buses.map((bus) => bus.name)).toEqual(['Main'])
    expect(routingDoc(rig)).toMatchObject({ stemBus: 0, clickBus: 0, guideBus: 0 })
  })
})

describe('bus editing', () => {
  it('adds, renames and removes buses everywhere they are named', () => {
    let rig = addBus(tourRig(), id)
    expect(rig.buses.at(-1)?.name).toBe('Bus 1')
    rig = renameBus(rig, 'Click', 'Drummer')
    expect(rig.clickBus).toBe('Drummer')
    expect(rig.routing.find((route) => route.bus === 'Drummer')?.channels).toEqual([4])
    expect(renameBus(rig, 'Drummer', 'IEM')).toBe(rig)
    rig = removeBus(rig, 'Bus 1')
    expect(rig.buses).toHaveLength(3)
    expect(rigSchema.safeParse(rig).success).toBe(true)
  })

  it('keeps at least one bus', () => {
    const rig = rigSchema.parse(defaultRig(2, id))
    expect(removeBus(rig, 'Main')).toBe(rig)
  })
})
