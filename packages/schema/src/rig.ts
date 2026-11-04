import { z } from 'zod'
import { colorSchema, gainSchema, idSchema, sampleRateSchema } from './common'

/** Buses a rig holds (the engine's `MAX_BUSES`). */
export const MAX_BUSES = 16
/** Device channels one bus feeds (the engine's `MAX_BUS_CHANNELS`). */
export const MAX_BUS_CHANNELS = 8

/** A named mix destination, for example `IEM`, `FOH` or `Click`. */
export const busSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  color: colorSchema.optional(),
  gain: gainSchema.default(1),
  mute: z.boolean().default(false),
  /** Front of house: the audience hears it, so click and guide must never reach it. */
  foh: z.boolean().default(false),
})
export type Bus = z.infer<typeof busSchema>

/**
 * Maps one bus (by name) to zero-based device output channels, in order: pairs are left and right,
 * a last odd channel gets the mono fold.
 */
export const routeSchema = z.object({
  bus: z.string().min(1),
  channels: z.array(z.number().int().nonnegative()).max(MAX_BUS_CHANNELS),
})
export type Route = z.infer<typeof routeSchema>

export const bufferSizeSchema = z.union([
  z.literal(32),
  z.literal(64),
  z.literal(128),
  z.literal(256),
  z.literal(512),
  z.literal(1024),
  z.literal(2048),
])

/** What a footswitch or controller does. */
export const controlActionSchema = z.enum(['playPause', 'stop', 'vamp', 'nextSection', 'previousSection', 'skipSection', 'stopAtSectionEnd', 'nextSong', 'cancel'])
export type ControlAction = z.infer<typeof controlActionSchema>

/** The MIDI message that fires a control. `channel: null` matches any channel. */
export const controlTriggerSchema = z.object({
  kind: z.enum(['note', 'cc', 'program']),
  channel: z.number().int().min(1).max(16).nullable(),
  number: z.number().int().min(0).max(127),
})
export type ControlTrigger = z.infer<typeof controlTriggerSchema>

export const controlBindingSchema = z.object({ action: controlActionSchema, trigger: controlTriggerSchema })
export type ControlBinding = z.infer<typeof controlBindingSchema>

/** The audio setup a show runs on. Routing belongs to the rig, not the song. */
export const rigSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    /** Output device name as the host reports it, for display. */
    device: z.string().default(''),
    /** Output device id from the engine. `null` is the system default output. */
    deviceId: z.string().nullable().default(null),
    /** `null` is the device's default rate. */
    sampleRate: sampleRateSchema.nullable().default(null),
    bufferSize: bufferSizeSchema,
    buses: z.array(busSchema).max(MAX_BUSES).default([]),
    routing: z.array(routeSchema).default([]),
    /** Buses (by name) for the generated click, the guide and the pads. Missing names fall back to the first bus. */
    clickBus: z.string().default('Click'),
    guideBus: z.string().default('Guide'),
    padBus: z.string().default('FOH'),
    /** The LTC bus. `null`, or a name the rig lacks, sends timecode nowhere: it never falls back. */
    timecodeBus: z.string().nullable().default(null),
    /** MIDI port for song cue events (`Stems` is the virtual source on macOS). `null`: no MIDI out. */
    midiOutput: z.string().nullable().default(null),
    /** MIDI port footswitches and controllers come in on. */
    midiInput: z.string().nullable().default(null),
    controls: z.array(controlBindingSchema).default([]),
  })
  .superRefine((rig, ctx) => {
    const names = new Set<string>()
    rig.buses.forEach((bus, index) => {
      if (names.has(bus.name)) ctx.addIssue({ code: 'custom', message: 'bus names must be unique', path: ['buses', index, 'name'] })
      names.add(bus.name)
    })
    rig.routing.forEach((route, index) => {
      if (!names.has(route.bus)) ctx.addIssue({ code: 'custom', message: 'route references an unknown bus', path: ['routing', index, 'bus'] })
    })
  })
export type Rig = z.infer<typeof rigSchema>
