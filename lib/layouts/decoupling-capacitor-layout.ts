/**
 * Specialized Layout for Decoupling Capacitors
 *
 * This module implements a layout strategy that places decoupling capacitors
 * as close as possible to their associated power pins on a chip, following
 * best-practice PCB layout guidelines (each cap adjacent to its pin, on the
 * same side as the pin when possible, oriented radially outward from the IC).
 *
 * Issue: https://github.com/tscircuit/matchpack/issues/15
 */

export interface Point {
  x: number
  y: number
}

export interface PinInfo {
  /** Pin number on the chip */
  pinNumber: number
  /** Net name (e.g. "VDD", "VCC", "GND") */
  net: string
  /** Absolute position of the pin centre */
  position: Point
  /** Which side of the chip this pin is on */
  side: "top" | "bottom" | "left" | "right"
}

export interface ComponentBounds {
  /** Centre of the chip */
  centre: Point
  /** Total width of the chip body */
  width: number
  /** Total height of the chip body */
  height: number
}

export interface CapacitorPlacement {
  /** The capacitor reference designator / id */
  capId: string
  /** The power pin this cap is decoupling */
  pinNumber: number
  /** Suggested placement position (centre of the capacitor) */
  position: Point
  /** Rotation in degrees (0 = pads left-right, 90 = pads top-bottom) */
  rotation: number
}

export interface DecouplingCapacitorLayoutOptions {
  /**
   * Gap between the chip body edge and the nearest pad of the capacitor.
   * Default: 0.5 mm
   */
  chipToCapGap?: number
  /**
   * Centre-to-centre spacing between adjacent capacitors placed on the same
   * side of the chip.
   * Default: 1.0 mm
   */
  capSpacing?: number
  /**
   * Capacitor body length (long axis).  Matches a standard 0402: 1.0 mm.
   */
  capLength?: number
  /**
   * Capacitor body width (short axis).  Matches a standard 0402: 0.5 mm.
   */
  capWidth?: number
}

/** Internal grouping used during layout */
interface SideGroup {
  side: "top" | "bottom" | "left" | "right"
  pins: PinInfo[]
}

/**
 * Given a set of power / decoupling pins on a chip and one capacitor per pin,
 * compute the best-fit placement for every capacitor so that:
 *
 *  1. Each cap is placed on the same side of the chip as its associated pin.
 *  2. Each cap is as close to its pin as the gap constraint allows.
 *  3. Caps on the same side are arranged in pin order so they don't overlap.
 *  4. The cap is oriented so its pads are aligned with the power trace direction
 *     (parallel to the chip edge → perpendicular to the current flow).
 */
export function layoutDecouplingCapacitors(
  chip: ComponentBounds,
  pins: PinInfo[],
  options: DecouplingCapacitorLayoutOptions = {},
): CapacitorPlacement[] {
  const {
    chipToCapGap = 0.5,
    capSpacing = 1.0,
    capLength = 1.0,
    capWidth = 0.5,
  } = options

  // Half-extents of the chip body
  const halfW = chip.width / 2
  const halfH = chip.height / 2

  // Group pins by side
  const sides: Record<string, PinInfo[]> = {
    top: [],
    bottom: [],
    left: [],
    right: [],
  }
  for (const pin of pins) {
    sides[pin.side].push(pin)
  }

  const placements: CapacitorPlacement[] = []

  for (const side of ["top", "bottom", "left", "right"] as const) {
    const sidePins = sides[side]
    if (sidePins.length === 0) continue

    // Sort pins by their position along the side axis so caps don't overlap
    const isHorizontalSide = side === "top" || side === "bottom"
    sidePins.sort((a, b) =>
      isHorizontalSide
        ? a.position.x - b.position.x
        : a.position.y - b.position.y,
    )

    for (let i = 0; i < sidePins.length; i++) {
      const pin = sidePins[i]
      let capX: number
      let capY: number
      let rotation: number

      // Distance from chip centre to the outer edge of the chip body on this side,
      // plus the gap, plus half the cap body (so the cap centre lands correctly).
      const halfCapMajor = capLength / 2

      switch (side) {
        case "top":
          // Cap sits above the chip, pads are left-right (rotation=0) so the
          // decoupling current flows straight into the power plane.
          capX = pin.position.x
          capY = chip.centre.y + halfH + chipToCapGap + halfCapMajor
          rotation = 0
          break

        case "bottom":
          capX = pin.position.x
          capY = chip.centre.y - halfH - chipToCapGap - halfCapMajor
          rotation = 0
          break

        case "left":
          // Cap sits to the left of the chip, pads are top-bottom (rotation=90).
          capX = chip.centre.x - halfW - chipToCapGap - halfCapMajor
          capY = pin.position.y
          rotation = 90
          break

        case "right":
          capX = chip.centre.x + halfW + chipToCapGap + halfCapMajor
          capY = pin.position.y
          rotation = 90
          break
      }

      // Resolve overlaps: if two caps on the same side would be closer than
      // capSpacing, nudge later ones outward along the side axis.
      if (i > 0) {
        const prev = placements[placements.length - 1]
        if (isHorizontalSide) {
          const minX = prev.position.x + capSpacing
          if (capX < minX) capX = minX
        } else {
          const minY = prev.position.y + capSpacing
          if (capY < minY) capY = minY
        }
      }

      placements.push({
        capId: `C_${pin.pinNumber}`,
        pinNumber: pin.pinNumber,
        position: { x: capX, y: capY },
        rotation,
      })
    }
  }

  return placements
}

// ---------------------------------------------------------------------------
// Convenience: detect which pins on a chip are power/ground and need decoupling
// ---------------------------------------------------------------------------

const POWER_NET_PATTERNS = [
  /^vdd/i,
  /^vcc/i,
  /^vss/i,
  /^gnd/i,
  /^pwr/i,
  /^power/i,
  /^avdd/i,
  /^dvdd/i,
  /^iovdd/i,
  /^vcca/i,
  /^vccio/i,
  /^3v3/i,
  /^1v8/i,
  /^5v/i,
]

/**
 * Returns true if the given net name looks like a power/ground rail that
 * typically requires a decoupling capacitor.
 */
export function isPowerNet(netName: string): boolean {
  return POWER_NET_PATTERNS.some((re) => re.test(netName))
}

/**
 * Filter a full pin list down to only those that need decoupling capacitors.
 */
export function filterDecouplingPins(pins: PinInfo[]): PinInfo[] {
  return pins.filter((p) => isPowerNet(p.net))
}
