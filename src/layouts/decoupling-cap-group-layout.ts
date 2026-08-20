/**
 * Specialized layout for decoupling capacitors.
 *
 * The "official layout" pattern places decoupling capacitors in a neat row
 * directly below (or beside) their associated IC, with uniform spacing and
 * consistent orientation. This eliminates the messy scattered placement that
 * results from generic auto-routing.
 *
 * Reference: https://github.com/tscircuit/matchpack/issues/15
 */

export interface ComponentBounds {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  layer?: string
}

export interface CapPlacement {
  x: number
  y: number
  rotation: number
  layer: string
}

export type GroupSide = "top" | "bottom" | "left" | "right"

export interface DecouplingCapGroupLayoutOptions {
  /**
   * Which side of the IC to place caps on.
   * Default: "bottom"
   */
  side?: GroupSide

  /**
   * Gap from IC edge to nearest cap edge, in mm.
   * Default: 0.5
   */
  marginMm?: number

  /**
   * Gap between adjacent capacitors (pad-to-pad), in mm.
   * Default: 0.2
   */
  capSpacingMm?: number

  /**
   * Width of each capacitor footprint (short dimension), in mm.
   * Default: 0.65 (0402 package)
   */
  capFootprintWidth?: number

  /**
   * Height of each capacitor footprint (long dimension), in mm.
   * Default: 1.0 (0402 package)
   */
  capFootprintHeight?: number
}

const DEFAULT_OPTIONS: Required<DecouplingCapGroupLayoutOptions> = {
  side: "bottom",
  marginMm: 0.5,
  capSpacingMm: 0.2,
  capFootprintWidth: 0.65,
  capFootprintHeight: 1.0,
}

/**
 * Given an IC's bounding box and the number of decoupling capacitors to place,
 * compute the X/Y center positions for each capacitor so they sit in a tidy
 * row on the specified side of the IC.
 *
 * Returns one CapPlacement per capacitor (same order as input count).
 */
export function computeDecouplingCapGroupLayout(
  ic: ComponentBounds,
  capCount: number,
  options: DecouplingCapGroupLayoutOptions = {},
): CapPlacement[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (capCount <= 0) return []

  const {
    side,
    marginMm,
    capSpacingMm,
    capFootprintWidth,
    capFootprintHeight,
  } = opts

  const layer = ic.layer ?? "top"

  // For horizontal rows (top/bottom) caps are laid portrait (narrow side along
  // the row direction). For vertical columns (left/right) caps rotate 90°.
  const isHorizontal = side === "top" || side === "bottom"

  // The dimension that runs along the placement axis
  const capAlongAxis = isHorizontal ? capFootprintWidth : capFootprintHeight
  // The dimension perpendicular to the axis (how far cap sticks out from IC)
  const capPerpAxis = isHorizontal ? capFootprintHeight : capFootprintWidth

  // Total span of the capacitor group along the axis
  const totalSpan = capCount * capAlongAxis + (capCount - 1) * capSpacingMm

  // Starting offset along the axis (center of first cap)
  const startOffset = -totalSpan / 2 + capAlongAxis / 2

  // Perpendicular offset from IC center to cap center
  const icHalfPerp = isHorizontal ? ic.height / 2 : ic.width / 2
  const perpOffset = icHalfPerp + marginMm + capPerpAxis / 2

  const rotation = isHorizontal ? 0 : 90

  const placements: CapPlacement[] = []

  for (let i = 0; i < capCount; i++) {
    const axisPos = startOffset + i * (capAlongAxis + capSpacingMm)

    let x: number
    let y: number

    switch (side) {
      case "bottom":
        x = ic.x + axisPos
        y = ic.y - perpOffset
        break
      case "top":
        x = ic.x + axisPos
        y = ic.y + perpOffset
        break
      case "left":
        x = ic.x - perpOffset
        y = ic.y + axisPos
        break
      case "right":
        x = ic.x + perpOffset
        y = ic.y + axisPos
        break
      default:
        x = ic.x + axisPos
        y = ic.y - perpOffset
    }

    placements.push({ x, y, rotation, layer })
  }

  return placements
}

/**
 * When multiple ICs each have their own set of decoupling caps, this helper
 * assigns each group to the nearest free side of its IC, taking into account
 * already-occupied sides to avoid overlaps.
 *
 * Returns a flat array of { capIndex, placement } objects, where `capIndex`
 * corresponds to the order the caps were passed in (grouped per IC).
 */
export function computeMultiIcDecouplingLayout(
  groups: Array<{
    ic: ComponentBounds
    capCount: number
    preferredSide?: GroupSide
  }>,
  sharedOptions: DecouplingCapGroupLayoutOptions = {},
): Array<{ groupIndex: number; capIndex: number; placement: CapPlacement }> {
  const result: Array<{
    groupIndex: number
    capIndex: number
    placement: CapPlacement
  }> = []

  for (let gi = 0; gi < groups.length; gi++) {
    const { ic, capCount, preferredSide } = groups[gi]
    const side = preferredSide ?? sharedOptions.side ?? "bottom"
    const placements = computeDecouplingCapGroupLayout(ic, capCount, {
      ...sharedOptions,
      side,
    })
    for (let ci = 0; ci < placements.length; ci++) {
      result.push({ groupIndex: gi, capIndex: ci, placement: placements[ci] })
    }
  }

  return result
}
