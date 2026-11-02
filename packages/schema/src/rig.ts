import { z } from 'zod'
import { colorSchema, idSchema, sampleRateSchema } from './common'

/** A named mix destination, for example `IEM`, `FOH` or `Click`. */
export const busSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  color: colorSchema.optional(),
})
export type Bus = z.infer<typeof busSchema>

/** Maps one bus (by name) to zero-based device output channels. */
export const routeSchema = z.object({
  bus: z.string().min(1),
  channels: z.array(z.number().int().nonnegative()),
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

/** The audio setup a show runs on. Routing belongs to the rig, not the song. */
export const rigSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    /** Output device name as the host reports it. */
    device: z.string(),
    sampleRate: sampleRateSchema,
    bufferSize: bufferSizeSchema,
    buses: z.array(busSchema).default([]),
    routing: z.array(routeSchema).default([]),
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
