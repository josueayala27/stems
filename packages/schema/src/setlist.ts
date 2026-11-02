import { z } from 'zod'
import { idSchema } from './common'

export const transitionSchema = z.enum(['stop', 'auto', 'crossfade'])
export type Transition = z.infer<typeof transitionSchema>

export const setlistItemSchema = z.object({
  songId: idSchema,
  transition: transitionSchema.default('stop'),
  preWaitMs: z.number().int().nonnegative().default(0),
  /** Pad that plays under the gap before this song, or null for silence. */
  padId: idSchema.nullable().default(null),
})
export type SetlistItem = z.infer<typeof setlistItemSchema>

export const setlistSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  items: z.array(setlistItemSchema).default([]),
})
export type Setlist = z.infer<typeof setlistSchema>
