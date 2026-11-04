import { MAX_BUS_CHANNELS, MAX_BUSES, type Bus, type Rig, type Song } from '@stems/schema'

/**
 * Rig routing maths. Pure functions; the Rust engine (`routing.rs`) applies the same fold rules.
 *
 * - A rig has named buses. Tracks pick a bus by name (`Track.defaultBus`); the rig maps each bus to device channels.
 * - A bus's channels, in order, pair up as left and right; a last odd channel gets the mono fold.
 * - Channels the device lacks are dropped before pairing.
 */

/** The bus-indexed routing the engine takes (`engine_set_routing`). */
export interface RoutingDoc {
  buses: { gain: number; mute: boolean; channels: number[] }[]
  stemBus: number
  clickBus: number
  guideBus: number
  padBus: number
  /** `null`: LTC plays nowhere. */
  timecodeBus: number | null
}

export type Target = { kind: 'stereo'; left: number; right: number } | { kind: 'mono'; channel: number }

/** Where a bus's channels go on a device with `deviceChannels` outputs. Matches `BusRoute::targets`. */
export function channelTargets(channels: readonly number[], deviceChannels: number): Target[] {
  const targets: Target[] = []
  let pending: number | null = null
  for (const channel of channels.slice(0, MAX_BUS_CHANNELS)) {
    if (channel >= deviceChannels) continue
    if (pending === null) pending = channel
    else {
      targets.push({ kind: 'stereo', left: pending, right: channel })
      pending = null
    }
  }
  if (pending !== null) targets.push({ kind: 'mono', channel: pending })
  return targets
}

/** `1/2 · 9 mono`, with 1-based channels as they are printed on interfaces. */
export function formatTargets(targets: readonly Target[]): string {
  if (targets.length === 0) return 'Not routed'
  return targets.map((target) => (target.kind === 'stereo' ? `${target.left + 1}/${target.right + 1}` : `${target.channel + 1} mono`)).join(' · ')
}

export function channelsOf(rig: Rig, busName: string): number[] {
  return rig.routing.find((route) => route.bus === busName)?.channels ?? []
}

/** Add or remove `channel` from a bus's channels, kept in ascending order. */
export function toggleChannel(channels: readonly number[], channel: number): number[] {
  if (channels.includes(channel)) return channels.filter((other) => other !== channel)
  if (channels.length >= MAX_BUS_CHANNELS) return [...channels]
  return [...channels, channel].sort((a, b) => a - b)
}

/** The rig with `busName` routed to `channels`. */
export function setChannels(rig: Rig, busName: string, channels: number[]): Rig {
  const routing = rig.routing.some((route) => route.bus === busName)
    ? rig.routing.map((route) => (route.bus === busName ? { ...route, channels } : route))
    : [...rig.routing, { bus: busName, channels }]
  return { ...rig, routing }
}

export function busIndex(rig: Rig, name: string): number | null {
  const index = rig.buses.findIndex((bus) => bus.name === name)
  return index >= 0 ? index : null
}

/** The bus stems play into when their own bus is missing: the first front-of-house bus, else the first. */
export function stemBusIndex(rig: Rig): number {
  const foh = rig.buses.findIndex((bus) => bus.foh)
  return foh >= 0 ? foh : 0
}

export function routingDoc(rig: Rig): RoutingDoc {
  return {
    buses: rig.buses.map((bus) => ({ gain: bus.gain, mute: bus.mute, channels: channelsOf(rig, bus.name) })),
    stemBus: stemBusIndex(rig),
    clickBus: busIndex(rig, rig.clickBus) ?? 0,
    guideBus: busIndex(rig, rig.guideBus) ?? 0,
    padBus: busIndex(rig, rig.padBus) ?? stemBusIndex(rig),
    timecodeBus: rig.timecodeBus === null ? null : busIndex(rig, rig.timecodeBus),
  }
}

export interface RoutingWarning {
  bus: string
  message: string
}

/** Channels any front-of-house bus reaches, on a device with `deviceChannels` outputs. */
function fohChannels(rig: Rig, deviceChannels: number): Set<number> {
  const channels = new Set<number>()
  for (const bus of rig.buses.filter((bus) => bus.foh)) {
    for (const channel of channelsOf(rig, bus.name)) if (channel < deviceChannels) channels.add(channel)
  }
  return channels
}

/**
 * Safety: click and guide must never reach the audience. Warns when the click or guide bus is a
 * front-of-house bus, shares a device channel with one, or when a click or guide track of `song`
 * plays into one.
 */
export function routingWarnings(rig: Rig, deviceChannels = Number.POSITIVE_INFINITY, song?: Song | null): RoutingWarning[] {
  const warnings: RoutingWarning[] = []
  const foh = fohChannels(rig, deviceChannels)
  const doc = routingDoc(rig)
  const check = (index: number, what: string) => {
    const bus = rig.buses[index]
    if (!bus || bus.mute) return
    if (bus.foh) {
      warnings.push({ bus: bus.name, message: `${what} plays into ${bus.name}, a front-of-house bus.` })
      return
    }
    const shared = channelsOf(rig, bus.name).filter((channel) => foh.has(channel))
    if (shared.length > 0) {
      const list = shared.map((channel) => channel + 1).join(', ')
      warnings.push({ bus: bus.name, message: `${what} on ${bus.name} shares output ${list} with front of house.` })
    }
  }
  check(doc.clickBus, 'The click')
  if (doc.guideBus !== doc.clickBus) check(doc.guideBus, 'The guide')
  if (doc.timecodeBus !== null) {
    check(doc.timecodeBus, 'Timecode')
    const ltc = rig.buses[doc.timecodeBus]
    if (ltc && !ltc.foh && (doc.timecodeBus === doc.clickBus || doc.timecodeBus === doc.guideBus)) {
      warnings.push({ bus: ltc.name, message: `Timecode shares ${ltc.name} with the click or guide: give LTC a bus of its own.` })
    }
  }
  for (const track of song?.tracks ?? []) {
    if (track.kind === 'stem') continue
    const index = busIndex(rig, track.defaultBus) ?? (track.kind === 'click' ? doc.clickBus : doc.guideBus)
    if (index === doc.clickBus || index === doc.guideBus) continue
    check(index, `Track “${track.name}”`)
  }
  return warnings
}

/** A starting rig for a device: FOH and IEM pairs on four outputs or more, one main pair otherwise. */
export function defaultRig(deviceChannels: number, newId: () => string = () => crypto.randomUUID()): Rig {
  const base = { id: newId(), name: 'Default rig', device: '', deviceId: null, sampleRate: null, bufferSize: 256 as const, timecodeBus: null }
  if (deviceChannels >= 4) {
    return {
      ...base,
      buses: [bus(newId(), 'FOH', true), bus(newId(), 'IEM', false)],
      routing: [
        { bus: 'FOH', channels: [0, 1] },
        { bus: 'IEM', channels: [2, 3] },
      ],
      clickBus: 'IEM',
      guideBus: 'IEM',
      padBus: 'FOH',
    }
  }
  return {
    ...base,
    buses: [bus(newId(), 'Main', false)],
    routing: [{ bus: 'Main', channels: [0, 1] }],
    clickBus: 'Main',
    guideBus: 'Main',
    padBus: 'Main',
  }
}

function bus(id: string, name: string, foh: boolean): Bus {
  return { id, name, gain: 1, mute: false, foh }
}

/** A unique name for a new bus: `Bus 1`, `Bus 2`… */
export function nextBusName(rig: Rig, prefix = 'Bus'): string {
  for (let n = 1; ; n++) {
    const name = `${prefix} ${n}`
    if (!rig.buses.some((bus) => bus.name === name)) return name
  }
}

export function addBus(rig: Rig, newId: () => string = () => crypto.randomUUID()): Rig {
  if (rig.buses.length >= MAX_BUSES) return rig
  const name = nextBusName(rig)
  return { ...rig, buses: [...rig.buses, bus(newId(), name, false)], routing: [...rig.routing, { bus: name, channels: [] }] }
}

/** Rename a bus everywhere the rig names it. Returns the rig unchanged when the name is empty or taken. */
export function renameBus(rig: Rig, from: string, to: string): Rig {
  const name = to.trim()
  if (!name || name === from || rig.buses.some((bus) => bus.name === name)) return rig
  const swap = (value: string) => (value === from ? name : value)
  return {
    ...rig,
    buses: rig.buses.map((bus) => (bus.name === from ? { ...bus, name } : bus)),
    routing: rig.routing.map((route) => ({ ...route, bus: swap(route.bus) })),
    clickBus: swap(rig.clickBus),
    guideBus: swap(rig.guideBus),
    padBus: swap(rig.padBus),
    timecodeBus: rig.timecodeBus === null ? null : swap(rig.timecodeBus),
  }
}

/** Remove a bus and its route. A rig keeps at least one bus. */
export function removeBus(rig: Rig, name: string): Rig {
  if (rig.buses.length <= 1) return rig
  return { ...rig, buses: rig.buses.filter((bus) => bus.name !== name), routing: rig.routing.filter((route) => route.bus !== name) }
}

export function updateBus(rig: Rig, name: string, patch: Partial<Omit<Bus, 'id' | 'name'>>): Rig {
  return { ...rig, buses: rig.buses.map((bus) => (bus.name === name ? { ...bus, ...patch } : bus)) }
}

// ── Simple output picking (the Mixer) ───────────────────────────────────────────────────────

export interface OutputChoice {
  /** `1/2`, `3`, `Off`. */
  label: string
  channels: number[]
}

/** Stereo pairs first (1/2, 3/4…), then single outputs, then off. */
export function outputChoices(deviceChannels: number): OutputChoice[] {
  const pairs: OutputChoice[] = []
  for (let left = 0; left + 1 < deviceChannels; left += 2) pairs.push({ label: `${left + 1}/${left + 2}`, channels: [left, left + 1] })
  const singles: OutputChoice[] = Array.from({ length: deviceChannels }, (_, channel) => ({ label: `${channel + 1}`, channels: [channel] }))
  return [...pairs, ...singles, { label: 'Off', channels: [] }]
}

/** The label for a bus's channels: a choice from `outputChoices`, or the folded targets for anything else. */
export function outputLabel(channels: readonly number[], deviceChannels: number): string {
  if (channels.length === 0) return 'Off'
  const choice = outputChoices(deviceChannels).find((entry) => entry.channels.length === channels.length && entry.channels.every((c, i) => c === channels[i]))
  return choice?.label ?? formatTargets(channelTargets(channels, deviceChannels))
}

export type QuickSetup = 'stereo' | 'inEars' | 'inEarsLtc'

/** Outputs a quick setup needs. */
export const QUICK_SETUP_OUTPUTS: Record<QuickSetup, number> = { stereo: 2, inEars: 4, inEarsLtc: 5 }

/**
 * Replace the rig's buses with a ready layout for a device with `deviceChannels` outputs. Keeps
 * the rig's id, name and device. Stems keep finding `FOH`, the bus name new tracks start on.
 * - stereo: everything on 1/2;
 * - inEars: the audience on 1/2 (FOH), click and guide with the band mix on 3/4;
 * - inEarsLtc: as inEars, plus timecode alone on the last output.
 */
export function quickSetup(rig: Rig, setup: QuickSetup, deviceChannels: number, newId: () => string = () => crypto.randomUUID()): Rig {
  if (deviceChannels < QUICK_SETUP_OUTPUTS[setup]) return rig
  if (setup === 'stereo') {
    return {
      ...rig,
      buses: [bus(newId(), 'FOH', false)],
      routing: [{ bus: 'FOH', channels: [0, 1] }],
      clickBus: 'FOH',
      guideBus: 'FOH',
      padBus: 'FOH',
      timecodeBus: null,
    }
  }
  const withLtc = setup === 'inEarsLtc'
  return {
    ...rig,
    buses: [bus(newId(), 'FOH', true), bus(newId(), 'In-ears', false), ...(withLtc ? [bus(newId(), 'LTC', false)] : [])],
    routing: [
      { bus: 'FOH', channels: [0, 1] },
      { bus: 'In-ears', channels: [2, 3] },
      ...(withLtc ? [{ bus: 'LTC', channels: [deviceChannels - 1] }] : []),
    ],
    clickBus: 'In-ears',
    guideBus: 'In-ears',
    padBus: 'FOH',
    timecodeBus: withLtc ? 'LTC' : null,
  }
}

/** A new output on the first pair (or single output) no other output uses. */
export function addOutput(rig: Rig, deviceChannels: number, newId: () => string = () => crypto.randomUUID()): Rig {
  const added = addBus(rig, newId)
  if (added === rig) return rig
  const used = new Set(rig.routing.flatMap((route) => route.channels))
  const free = outputChoices(deviceChannels).find((choice) => choice.channels.length > 0 && choice.channels.every((c) => !used.has(c)))
  const name = added.buses.at(-1)!.name
  const renamed = renameBus(added, name, nextBusName(rig, 'Output'))
  return setChannels(renamed, renamed.buses.at(-1)!.name, free?.channels ?? [])
}
