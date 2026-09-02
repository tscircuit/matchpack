/**
 * Specialized layout algorithm for decoupling capacitors.
 *
 * Goal: place each decoupling capacitor adjacent to the IC power/ground pin
 * it is associated with, on the same side of the IC as that pin.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Point {
  x: number
  y: number
}

export type Side = "top" | "bottom" | "left" | "right"

/**
 * Information about an IC pin that a decoupling capacitor is associated with.
 */
export interface PinInfo {
  /** Numeric or positional identifier used to sort/cluster placements */
  pinNumber: number
  /** Power/ground net name */
  net: string
  /** Physical position of the pin on the PCB */
  position: Point
  /** Which side of the IC the pin is on */
  side: Side
}

/**
 * Input describing a single decoupling capacitor and where it should be
 * placed relative to its associated IC power pin.
 */
export interface DecouplingCapPlacement {
  /** Unique identifier for the capacitor (source_component_id) */
  capacitorId: string
  /** Resolved information about the associated IC power pin */
  pinInfo: PinInfo
}

/**
 * Result of running the layout algorithm for one capacitor.
 */
export interface PlacedDecouplingCap {
  capacitorId: string
  position: Point
  rotation: number // degrees
  side: Side
}

// ---------------------------------------------------------------------------
// Power-net detection
// ---------------------------------------------------------------------------

/**
 * Patterns that identify power/ground net names.
 *
 * Extended to cover common variants: AGND, DGND, PGND, AVSS, DVSS, etc.
 */
export const POWER_NET_PATTERNS: RegExp[] = [
  /^vcc/i,
  /^avcc/i,
  /^dvcc/i,
  /^vdd/i,
  /^avdd/i,
  /^dvdd/i,
  /^vss/i,
  /^avss/i,
  /^dvss/i,
  /^gnd/i,
  /^agnd/i,
  /^dgnd/i,
  /^pgnd/i,
  /^pwr/i,
  /^power/i,
  /^vbat/i,
  /^v3v3/i,
  /^v5v/i,
  /^v1v8/i,
  /^vcca/i,
  /^vccd/i,
  /^vcore/i,
  /^vio/i,
]

/**
 * Returns true if the given net name looks like a power or ground rail.
 */
export function isPowerNet(netName: string): boolean {
  return POWER_NET_PATTERNS.some((pattern) => pattern.test(netName))
}

/**
 * From a list of (netName, pinNumber) pairs, keep only the ones that are
 * power/ground nets.
 */
export function filterDecouplingPins(
  pins: Array<{ net: string; pinNumber: number; position: Point; side: Side }>,
): Array<{ net: string; pinNumber: number; position: Point; side: Side }> {
  return pins.filter((p) => isPowerNet(p.net))
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

/** How far from the IC pin the capacitor body centre should sit (mm) */
const DEFAULT_CLEARANCE_MM = 0.8

/** Map from side to the outward unit vector */
const SIDE_NORMAL: Record<Side, Point> = {
  top: { x: 0, y: 1 },
  bottom: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/** Rotation (degrees) to give a 0402/0603 capacitor on each side so its
 *  pads align with the power and ground rails running away from the IC. */
const SIDE_ROTATION: Record<Side, number> = {
  top: 0,
  bottom: 0,
  left: 90,
  right: 90,
}

/**
 * Compute the placement (position + rotation) for a single decoupling
 * capacitor given its associated IC power pin.
 */
export function computeCapPlacement(
  pinInfo: PinInfo,
  clearanceMm: number = DEFAULT_CLEARANCE_MM,
): { position: Point; rotation: number; side: Side } {
  const normal = SIDE_NORMAL[pinInfo.side]
  return {
    position: {
      x: pinInfo.position.x + normal.x * clearanceMm,
      y: pinInfo.position.y + normal.y * clearanceMm,
    },
    rotation: SIDE_ROTATION[pinInfo.side],
    side: pinInfo.side,
  }
}

// ---------------------------------------------------------------------------
// Main layout function
// ---------------------------------------------------------------------------

/**
 * Run the decoupling-capacitor layout algorithm.
 *
 * For each capacitor in `placements`, computes a physical (x, y, rotation)
 * that places it just outside the IC boundary adjacent to its power pin.
 *
 * When multiple capacitors share the same pin/net, they are spread along the
 * axis perpendicular to the outward normal so they do not overlap.
 */
export function layoutDecouplingCapacitors(
  placements: DecouplingCapPlacement[],
  options: {
    clearanceMm?: number
    spacingMm?: number
  } = {},
): PlacedDecouplingCap[] {
  const clearance = options.clearanceMm ?? DEFAULT_CLEARANCE_MM
  const spacing = options.spacingMm ?? 0.6

  // Group capacitors by (side, pinNumber) so we can spread them out.
  const groups = new Map<string, DecouplingCapPlacement[]>()
  for (const p of placements) {
    const key = `${p.pinInfo.side}::${p.pinInfo.pinNumber}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  const results: PlacedDecouplingCap[] = []

  for (const group of groups.values()) {
    const count = group.length
    // Spread caps symmetrically around the base position along the tangent axis.
    group.forEach((cap, i) => {
      const base = computeCapPlacement(cap.pinInfo, clearance)
      const tangent = getTangent(cap.pinInfo.side)
      const offset = (i - (count - 1) / 2) * spacing
      results.push({
        capacitorId: cap.capacitorId,
        position: {
          x: base.position.x + tangent.x * offset,
          y: base.position.y + tangent.y * offset,
        },
        rotation: base.rotation,
        side: base.side,
      })
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns the unit vector tangent to the given side (perpendicular to normal). */
function getTangent(side: Side): Point {
  switch (side) {
    case "top":
    case "bottom":
      return { x: 1, y: 0 }
    case "left":
    case "right":
      return { x: 0, y: 1 }
  }
}
