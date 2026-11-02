import { z } from 'zod'

export const idSchema = z.string().min(1)
export const colorSchema = z.string().min(1)

/** A position in samples on the song timeline. Sample position is the only time (docs/architecture/02). */
export const sampleSchema = z.number().int().nonnegative()

export const sampleRateSchema = z.number().int().positive()

export const bpmSchema = z.number().positive().max(999)

/** Linear gain multiplier. 1 is unity; 0 is silence. */
export const gainSchema = z.number().nonnegative().max(4)

export const timeSignatureSchema = z.object({
  numerator: z.number().int().min(1).max(32),
  /** Note value of one beat: 2, 4, 8 or 16. */
  denominator: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
})
export type TimeSignature = z.infer<typeof timeSignatureSchema>
