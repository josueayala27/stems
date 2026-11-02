export type Side = 'top' | 'right' | 'bottom' | 'left'
export type Align = 'start' | 'end'
export type Placement = Side | `${Side}-${Align}`

export interface PlacementMotion {
  /** CSS transform-origin: the edge touching the anchor. */
  origin: string
  /** Offset the surface starts from, pointing back towards the anchor. */
  x: number
  y: number
}

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

export function parsePlacement(value: string | null | undefined): { side: Side; align: Align | null } {
  const [rawSide, rawAlign] = (value ?? 'bottom').split('-')
  const side = SIDES.find((s) => s === rawSide) ?? 'bottom'
  const align = rawAlign === 'start' || rawAlign === 'end' ? rawAlign : null
  return { side, align }
}

/** Where a floating surface grows from and which way it travels when it enters. */
export function placementMotion(placement: string | null | undefined, distance: number): PlacementMotion {
  const { side, align } = parsePlacement(placement)
  const vertical = side === 'top' || side === 'bottom'
  const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
  const cross = vertical
    ? align === 'start' ? 'left' : align === 'end' ? 'right' : 'center'
    : align === 'start' ? 'top' : align === 'end' ? 'bottom' : 'center'
  const origin = vertical ? `${cross} ${opposite[side]}` : `${opposite[side]} ${cross}`
  const x = side === 'left' ? distance : side === 'right' ? -distance : 0
  const y = side === 'top' ? distance : side === 'bottom' ? -distance : 0
  return { origin, x, y }
}
