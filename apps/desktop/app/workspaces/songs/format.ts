/** `m:ss` for a length in seconds. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** `48 kHz`, `44.1 kHz`. */
export function formatRate(sampleRate: number): string {
  return `${Number((sampleRate / 1000).toFixed(1))} kHz`
}

/** The last path segment, for display. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
