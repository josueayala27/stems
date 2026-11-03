import { z } from 'zod'
import { idSchema } from './common'

export const transitionSchema = z.enum(['stop', 'auto', 'crossfade'])
export type Transition = z.infer<typeof transitionSchema>

/** An audio file looped as a pad. Pads crossfade when the setlist reaches a song with another pad. */
export const padSchema = z.object({
  file: z.string().min(1),
  name: z.string().min(1),
})
export type Pad = z.infer<typeof padSchema>

export const setlistItemSchema = z.object({
  songId: idSchema,
  transition: transitionSchema.default('stop'),
  preWaitMs: z.number().int().nonnegative().default(0),
  /** Overlap with the previous song when `transition` is `crossfade`. */
  crossfadeMs: z.number().int().nonnegative().default(4000),
  /** Ambient loop that plays under this song and into the next, or null to keep the current pad. */
  pad: padSchema.nullable().default(null),
})
export type SetlistItem = z.infer<typeof setlistItemSchema>

export const setlistSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  items: z.array(setlistItemSchema).default([]),
})
export type Setlist = z.infer<typeof setlistSchema>
