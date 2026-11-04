// Fader and meter scales for the Mixer. Gains are linear in the engine; faders and meters are in dB.

/** Fader travel: -60 dB at the bottom (then off), +6 dB at the top. */
export const FADER_MIN_DB = -60
export const FADER_MAX_DB = 6
/** Meters show 60 dB of range. */
export const METER_FLOOR_DB = -60

export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : Number.NEGATIVE_INFINITY
}

export function dbToGain(db: number): number {
  return Number.isFinite(db) ? 10 ** (db / 20) : 0
}

/** Fader position 0–100 to linear gain. 0 is off. */
export function faderToGain(position: number): number {
  if (position <= 0) return 0
  const db = FADER_MIN_DB + (Math.min(position, 100) / 100) * (FADER_MAX_DB - FADER_MIN_DB)
  return dbToGain(db)
}

/** Linear gain to fader position 0–100, rounded to the slider step. */
export function gainToFader(gain: number): number {
  const db = gainToDb(gain)
  if (db <= FADER_MIN_DB) return 0
  return Math.round(Math.min(100, ((db - FADER_MIN_DB) / (FADER_MAX_DB - FADER_MIN_DB)) * 100))
}

/** `-6.0 dB`, `+2.5 dB`, `0.0 dB` or `−∞`. */
export function formatDb(gain: number): string {
  const db = gainToDb(gain)
  if (!Number.isFinite(db) || db < FADER_MIN_DB - 0.05) return '−∞'
  const rounded = Math.round(db * 10) / 10
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)} dB`
}

/** Meter fill 0–1 for a linear level, on a dB scale from `METER_FLOOR_DB` to 0 dBFS. */
export function meterFraction(level: number): number {
  const db = gainToDb(level)
  if (db <= METER_FLOOR_DB) return 0
  return Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB)
}

/** A level at or over full scale clips on the device. */
export function clips(level: number): boolean {
  return level >= 1
}
