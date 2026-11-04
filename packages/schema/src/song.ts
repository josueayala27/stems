import { z } from 'zod'
import { bpmSchema, colorSchema, gainSchema, idSchema, sampleRateSchema, sampleSchema, timeSignatureSchema } from './common'

export const tempoPointSchema = z.object({
  sample: sampleSchema,
  bpm: bpmSchema,
  timeSignature: timeSignatureSchema,
})
export type TempoPoint = z.infer<typeof tempoPointSchema>

export const trackKindSchema = z.enum(['stem', 'click', 'guide'])
export type TrackKind = z.infer<typeof trackKindSchema>

/** One audio lane. Media stays on disk; the store keeps the path and a hash to relink missing files. */
export const trackSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  file: z.string(),
  hash: z.string(),
  kind: trackKindSchema,
  gain: gainSchema.default(1),
  mute: z.boolean().default(false),
  color: colorSchema,
  /** Bus name from the rig, e.g. `FOH`. Routing to device channels belongs to the rig. */
  defaultBus: z.string().min(1),
})
export type Track = z.infer<typeof trackSchema>

export const sectionSchema = z
  .object({
    id: idSchema,
    /** intro, verse, chorus, bridge, outro or a custom name. */
    name: z.string().min(1),
    startSample: sampleSchema,
    endSample: sampleSchema,
    color: colorSchema,
    loopable: z.boolean().default(true),
  })
  .refine((section) => section.endSample > section.startSample, {
    message: 'endSample must be after startSample',
    path: ['endSample'],
  })
export type Section = z.infer<typeof sectionSchema>

export const markerActionSchema = z.enum(['none', 'stop', 'loop', 'next'])
export type MarkerAction = z.infer<typeof markerActionSchema>

/** A cue point with an action the engine applies when the play head reaches it. */
export const markerSchema = z.object({
  id: idSchema,
  name: z.string(),
  sample: sampleSchema,
  action: markerActionSchema.default('none'),
})
export type Marker = z.infer<typeof markerSchema>

/** When a cue event fires: at an exact sample or at a marker. */
export const cueAnchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sample'), sample: sampleSchema }),
  z.object({ kind: z.literal('marker'), markerId: idSchema }),
])
export type CueAnchor = z.infer<typeof cueAnchorSchema>

const midiChannelSchema = z.number().int().min(1).max(16)
const midiValueSchema = z.number().int().min(0).max(127)

export const cueActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('midiProgram'), port: z.string(), channel: midiChannelSchema, program: midiValueSchema }),
  z.object({
    kind: z.literal('midiNote'),
    port: z.string(),
    channel: midiChannelSchema,
    note: midiValueSchema,
    velocity: midiValueSchema,
  }),
  z.object({ kind: z.literal('midiCc'), port: z.string(), channel: midiChannelSchema, controller: midiValueSchema, value: midiValueSchema }),
  /** Start timecode at an offset (milliseconds) from this point. */
  z.object({ kind: z.literal('timecode'), offsetMs: z.number().int().nonnegative() }),
  /** A song or section change sent to Lumen. */
  z.object({ kind: z.literal('lumen'), message: z.string().min(1) }),
])
export type CueAction = z.infer<typeof cueActionSchema>

export const cueEventSchema = z.object({
  id: idSchema,
  at: cueAnchorSchema,
  action: cueActionSchema,
})
export type CueEvent = z.infer<typeof cueEventSchema>

export const songSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    artist: z.string().default(''),
    bpm: bpmSchema,
    key: z.string().default(''),
    timeSignature: timeSignatureSchema,
    durationSamples: sampleSchema,
    sampleRate: sampleRateSchema,
    /**
     * Start point: file sample where bar 1 begins. Audio before it is skipped; every other position
     * in the song (tempo map, sections, markers, cue events) counts from it.
     */
    startSample: sampleSchema.default(0),
    tempoMap: z.array(tempoPointSchema).default([]),
    tracks: z.array(trackSchema).default([]),
    sections: z.array(sectionSchema).default([]),
    markers: z.array(markerSchema).default([]),
    events: z.array(cueEventSchema).default([]),
  })
  .superRefine((song, ctx) => {
    song.tempoMap.forEach((point, index) => {
      const previous = song.tempoMap[index - 1]
      if (previous && point.sample <= previous.sample) {
        ctx.addIssue({ code: 'custom', message: 'tempoMap must be sorted by sample', path: ['tempoMap', index, 'sample'] })
      }
    })
    const markerIds = new Set(song.markers.map((marker) => marker.id))
    song.events.forEach((event, index) => {
      if (event.at.kind === 'marker' && !markerIds.has(event.at.markerId)) {
        ctx.addIssue({ code: 'custom', message: 'event references an unknown marker', path: ['events', index, 'at'] })
      }
    })
  })
export type Song = z.infer<typeof songSchema>
