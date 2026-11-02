/** Window after a tooltip closes during which the next one opens instantly. */
export const TOOLTIP_SKIP_WINDOW_MS = 300

export function resolveTooltipDelay(now: number, lastClosedAt: number | null, delay: number, skipWindow = TOOLTIP_SKIP_WINDOW_MS): number {
  if (lastClosedAt !== null && now - lastClosedAt < skipWindow) return 0
  return delay
}
