/**
 * Specialized layout algorithm for decoupling capacitors.
 *
 * Places each decap adjacent to the IC power/ground pin on the same net,
 * choosing the outward direction from the IC edge nearest that pin.
 */

export type Side = "top" | "bottom" | "left" | "right"

export interface PinInfo {
  /** Unique pin identifier (e.g. pin number 1-based or hashed) */
  pinNumber: number
  /** Net name this pin belongs to */
  net: string
  /** Absolute position of the IC power pin (mm) */
  position: { x: number; y: number }
  /** Which side of the IC package this pin is on */
  side: Side
}

export interface DecapPlacement {
  /** source_component_id of the decoupling capacitor */
  componentId: string
  /** Recommended centre position (mm) */
  position: { x: number; y: number }
  /** Recommended rotation in degrees */
  rotation: number
  /** Side of the IC this cap is placed on */
  side: Side
  /** The net this cap decouples */
  net: string
}

export interface DecapLayoutOptions {
  /** Distance from the IC pin to the near edge of the decap (mm). Default 0.5 */
  clearance?: number
  /** Step between adjacent decaps on the same side (mm). Default 1.0 */
  step?: number
}

// ---------------------------------------------------------------------------
// Power-net detection helpers
// ---------------------------------------------------------------------------

/**
 * Patterns that identify a net name as a power / ground rail.
 * Includes common analogue (AGND/AVSS), digital (DGND/DVSS), and
 * power-ground (PGND) variants so that `filterDecouplingPins` works
 * correctly for mixed-signal and power-supply designs.
 */
export const POWER_NET_PATTERNS: RegExp[] = [
  // Supply rails
  /^vcc/i,
  /^vdd/i,
  /^vss/i,
  /^avss/i,
  /^dvss/i,
  /^vbat/i,
  /^v3v3/i,
  /^v5v/i,
  /^v1v8/i,
  /^v\d+v\d*/i,
  /^pwr/i,
  /^power/i,
  /^vbus/i,
  /^vsys/i,
  /^vmain/i,
  /^vcore/i,
  /^vio/i,
  /^vref/i,
  /^vana/i,
  /^vdig/i,
  // Ground rails — explicit analogue / digital / power-ground variants
  /^gnd/i,
  /^agnd/i,
  /^dgnd/i,
  /^pgnd/i,
  /^sgnd/i,
  /^egnd/i,
  /^gndd/i,
  /^gnda/i,
]

/**
 * Returns `true` when `netName` matches any known power/ground pattern.
 */
export function isPowerNet(netName: string): boolean {
  return POWER_NET_PATTERNS.some((re) => re.test(netName))
}

/**
 * Filters `pins` to those whose net names look like power / ground rails.
 */
export function filterDecouplingPins(pins: PinInfo[]): PinInfo[] {
  return pins.filter((p) => isPowerNet(p.net))
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * Returns the outward unit vector for a given IC side.
 */
function sideVector(side: Side): { dx: number; dy: number } {
  switch (side) {
    case "top":
      return { dx: 0, dy: 1 }
    case "bottom":
      return { dx: 0, dy: -1 }
    case "left":
      return { dx: -1, dy: 0 }
    case "right":
      return { dx: 1, dy: 0 }
  }
}

/**
 * Returns the rotation (degrees) for a 0402/0603 decap placed on `side`.
 * Pads run parallel to the IC edge, so the component axis is perpendicular.
 */
function rotationForSide(side: Side): number {
  switch (side) {
    case "top":
    case "bottom":
      return 90 // pads on left/right → component body horizontal → 90°
    case "left":
    case "right":
      return 0 // pads on top/bottom → component body vertical → 0°
  }
}

// ---------------------------------------------------------------------------
// Main layout function
// ---------------------------------------------------------------------------

/**
 * Computes placement (position + rotation) for each decoupling capacitor
 * described in `decapMap`.
 *
 * @param decapMap  Map from `source_component_id` → `PinInfo` for each decap.
 * @param options   Optional tuning (clearance, step).
 * @returns         Array of `DecapPlacement` objects, one per entry in the map.
 */
export function layoutDecouplingCapacitors(
  decapMap: Map<string, PinInfo>,
  options: DecapLayoutOptions = {},
): DecapPlacement[] {
  const clearance = options.clearance ?? 0.5
  const step = options.step ?? 1.0

  // Group decaps by side so we can spread them out without overlap.
  const bySide = new Map<Side, Array<{ id: string; pin: PinInfo }>>()
  for (const [id, pin] of decapMap) {
    const arr = bySide.get(pin.side) ?? []
    arr.push({ id, pin })
    bySide.set(pin.side, arr)
  }

  const placements: DecapPlacement[] = []

  for (const [side, caps] of bySide) {
    const { dx, dy } = sideVector(side)
    const rotation = rotationForSide(side)
    const isVertical = side === "left" || side === "right"

    // Sort along the IC edge (tangential axis) so identical-net caps end up
    // neatly stacked before spreading to a second row.
    caps.sort((a, b) => {
      const ta = isVertical ? a.pin.position.y : a.pin.position.x
      const tb = isVertical ? b.pin.position.y : b.pin.position.x
      return ta - tb
    })

    // Track how many caps we've placed at each tangential slot to allow a
    // second row when multiple caps share a pin position.
    const slotDepth = new Map<string, number>()

    for (const { id, pin } of caps) {
      const tangential = isVertical ? pin.position.y : pin.position.x
      const slotKey = tangential.toFixed(3)
      const depth = slotDepth.get(slotKey) ?? 0
      slotDepth.set(slotKey, depth + 1)

      // Normal (outward) offset: clearance + extra rows push further out.
      const normalOffset = clearance + depth * step

      // Tangential position stays aligned with the IC pin.
      const cx = pin.position.x + dx * normalOffset
      const cy = pin.position.y + dy * normalOffset

      placements.push({
        componentId: id,
        position: { x: cx, y: cy },
        rotation,
        side,
        net: pin.net,
      })
    }
  }

  return placements
}
