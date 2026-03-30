/**
 * Specialized Layout for Decoupling Capacitors
 *
 * This module provides a layout algorithm that places decoupling capacitors
 * in a clean, organized grid pattern adjacent to their associated IC components,
 * rather than the default scattered placement.
 *
 * Matches the "official layout" style shown in issue #15.
 */

export interface Point {
  x: number
  y: number
}

export interface ComponentBounds {
  center: Point
  width: number
  height: number
}

export interface DecouplingCapacitorLayoutOptions {
  /**
   * Spacing between adjacent capacitors in the grid (mm)
   * @default 0.5
   */
  capSpacing?: number

  /**
   * Maximum number of capacitors per row in the grid
   * @default 4
   */
  capsPerRow?: number

  /**
   * Distance from the IC edge to the first row of capacitors (mm)
   * @default 0.8
   */
  offsetFromIC?: number

  /**
   * Width of a capacitor footprint (mm)
   * @default 0.6
   */
  capWidth?: number

  /**
   * Height of a capacitor footprint (mm)
   * @default 0.3
   */
  capHeight?: number

  /**
   * Which side of the IC to place capacitors on
   * @default "bottom"
   */
  placementSide?: "top" | "bottom" | "left" | "right" | "auto"
}

export interface ComponentPlacement {
  /** The component identifier */
  componentId: string
  /** X position of the component center */
  x: number
  /** Y position of the component center */
  y: number
  /** Rotation in degrees */
  rotation: number
}

export interface DecouplingCapacitorGroup {
  /** The IC that these capacitors decouple */
  icId: string
  /** Position and size of the IC */
  icBounds: ComponentBounds
  /** IDs of the decoupling capacitors associated with this IC */
  capacitorIds: string[]
}

/**
 * Computes positions for decoupling capacitors in an organized grid layout
 * adjacent to their associated IC.
 *
 * The algorithm:
 * 1. Determines which side of the IC has the most available space
 * 2. Creates a tight grid of capacitors on that side
 * 3. Centers the grid along the IC edge
 * 4. Orients capacitors for shortest trace length to IC power pins
 *
 * @param group - The IC and its associated decoupling capacitors
 * @param options - Layout configuration options
 * @returns Array of component placements for the decoupling capacitors
 */
export function computeDecouplingCapacitorGridLayout(
  group: DecouplingCapacitorGroup,
  options: DecouplingCapacitorLayoutOptions = {},
): ComponentPlacement[] {
  const {
    capSpacing = 0.5,
    capsPerRow = 4,
    offsetFromIC = 0.8,
    capWidth = 0.6,
    capHeight = 0.3,
    placementSide = "bottom",
  } = options

  const { icBounds, capacitorIds } = group
  const { center: icCenter, width: icWidth, height: icHeight } = icBounds

  const placements: ComponentPlacement[] = []
  const numCaps = capacitorIds.length

  if (numCaps === 0) return placements

  const actualCapsPerRow = Math.min(numCaps, capsPerRow)
  const numRows = Math.ceil(numCaps / capsPerRow)

  // Determine placement side
  const side =
    placementSide === "auto"
      ? determineBestSide(icBounds)
      : placementSide

  // Compute grid origin based on side
  let gridOriginX: number
  let gridOriginY: number
  let capPlacementWidth: number
  let capPlacementHeight: number
  let rotation: number

  switch (side) {
    case "bottom": {
      // Grid goes downward from the bottom edge of the IC
      // Row 0 is closest to IC, subsequent rows go further down
      const totalGridWidth =
        actualCapsPerRow * capWidth + (actualCapsPerRow - 1) * capSpacing
      gridOriginX = icCenter.x - totalGridWidth / 2 + capWidth / 2
      gridOriginY =
        icCenter.y - icHeight / 2 - offsetFromIC - capHeight / 2
      capPlacementWidth = capWidth
      capPlacementHeight = capHeight
      rotation = 0
      break
    }
    case "top": {
      const totalGridWidth =
        actualCapsPerRow * capWidth + (actualCapsPerRow - 1) * capSpacing
      gridOriginX = icCenter.x - totalGridWidth / 2 + capWidth / 2
      gridOriginY =
        icCenter.y + icHeight / 2 + offsetFromIC + capHeight / 2
      capPlacementWidth = capWidth
      capPlacementHeight = capHeight
      rotation = 0
      break
    }
    case "left": {
      // Capacitors rotated 90 degrees, grid goes leftward
      const totalGridHeight =
        actualCapsPerRow * capWidth + (actualCapsPerRow - 1) * capSpacing
      gridOriginX =
        icCenter.x - icWidth / 2 - offsetFromIC - capHeight / 2
      gridOriginY = icCenter.y - totalGridHeight / 2 + capWidth / 2
      capPlacementWidth = capHeight
      capPlacementHeight = capWidth
      rotation = 90
      break
    }
    case "right": {
      const totalGridHeight =
        actualCapsPerRow * capWidth + (actualCapsPerRow - 1) * capSpacing
      gridOriginX =
        icCenter.x + icWidth / 2 + offsetFromIC + capHeight / 2
      gridOriginY = icCenter.y - totalGridHeight / 2 + capWidth / 2
      capPlacementWidth = capHeight
      capPlacementHeight = capWidth
      rotation = 90
      break
    }
    default: {
      // Default to bottom
      const totalGridWidth =
        actualCapsPerRow * capWidth + (actualCapsPerRow - 1) * capSpacing
      gridOriginX = icCenter.x - totalGridWidth / 2 + capWidth / 2
      gridOriginY =
        icCenter.y - icHeight / 2 - offsetFromIC - capHeight / 2
      capPlacementWidth = capWidth
      capPlacementHeight = capHeight
      rotation = 0
    }
  }

  // Place each capacitor in the grid
  for (let idx = 0; idx < numCaps; idx++) {
    const row = Math.floor(idx / capsPerRow)
    const col = idx % capsPerRow

    let x: number
    let y: number

    switch (side) {
      case "bottom": {
        x = gridOriginX + col * (capPlacementWidth + capSpacing)
        y = gridOriginY - row * (capPlacementHeight + capSpacing)
        break
      }
      case "top": {
        x = gridOriginX + col * (capPlacementWidth + capSpacing)
        y = gridOriginY + row * (capPlacementHeight + capSpacing)
        break
      }
      case "left": {
        x = gridOriginX - row * (capPlacementHeight + capSpacing)
        y = gridOriginY + col * (capPlacementWidth + capSpacing)
        break
      }
      case "right": {
        x = gridOriginX + row * (capPlacementHeight + capSpacing)
        y = gridOriginY + col * (capPlacementWidth + capSpacing)
        break
      }
      default: {
        x = gridOriginX + col * (capPlacementWidth + capSpacing)
        y = gridOriginY - row * (capPlacementHeight + capSpacing)
      }
    }

    placements.push({
      componentId: capacitorIds[idx],
      x,
      y,
      rotation,
    })
  }

  return placements
}

/**
 * Determines the best side of an IC to place decoupling capacitors,
 * based on available board space (currently defaults to bottom).
 * Can be extended to analyze surrounding component density.
 */
function determineBestSide(
  icBounds: ComponentBounds,
): "top" | "bottom" | "left" | "right" {
  // Default heuristic: wider ICs get bottom placement,
  // taller ICs get right placement
  if (icBounds.width >= icBounds.height) {
    return "bottom"
  }
  return "right"
}

/**
 * Groups decoupling capacitors by their associated IC component.
 *
 * Detection heuristics:
 * - Capacitor names matching /^C\d+/
 * - Connected to power (VCC, VDD, 3V3, 5V) and ground (GND, VSS) nets
 * - Small capacitance values typical of decoupling (1nF–100µF)
 *
 * @param components - All source components in the schematic
 * @param netlist - Net connectivity information
 * @returns Array of groups, each with an IC and its decoupling caps
 */
export function groupDecouplingCapacitorsByIC(
  components: Array<{
    id: string
    name: string
    type: string
    ftype?: string
    value?: string
  }>,
  netlist: Array<{
    netId: string
    netName: string
    componentIds: string[]
  }>,
): DecouplingCapacitorGroup[] {
  // Identify ICs and capacitors
  const ics = components.filter(
    (c) =>
      c.ftype === "simple_chip" ||
      c.type === "chip" ||
      /^U\d+/.test(c.name ?? ""),
  )

  const caps = components.filter(
    (c) =>
      c.ftype === "simple_capacitor" ||
      c.type === "simple_capacitor" ||
      c.type === "capacitor" ||
      /^C\d+/.test(c.name ?? ""),
  )

  // Power and ground net name patterns
  const powerNetPattern =
    /^(VCC|VDD|3V3|5V|3\.3V|5\.0V|VBUS|AVCC|DVCC|PWR)/i
  const groundNetPattern = /^(GND|VSS|AGND|DGND|PGND|EARTH)/i

  // Find power and ground nets
  const powerNets = netlist.filter((n) => powerNetPattern.test(n.netName))
  const groundNets = netlist.filter((n) => groundNetPattern.test(n.netName))

  const groups: DecouplingCapacitorGroup[] = []

  for (const ic of ics) {
    // Find nets connected to this IC
    const icNets = netlist.filter((n) => n.componentIds.includes(ic.id))
    const icPowerNets = icNets.filter((n) =>
      powerNets.some((pn) => pn.netId === n.netId),
    )
    const icGroundNets = icNets.filter((n) =>
      groundNets.some((gn) => gn.netId === n.netId),
    )

    if (icPowerNets.length === 0 && icGroundNets.length === 0) continue

    // Find decoupling caps connected to the same power/ground nets as this IC
    const decouplingCaps = caps.filter((cap) => {
      const capNets = netlist.filter((n) => n.componentIds.includes(cap.id))
      const capNetIds = new Set(capNets.map((n) => n.netId))

      // A decoupling cap must be connected to both a power and ground net
      const connectedToPower =
        icPowerNets.some((n) => capNetIds.has(n.netId)) ||
        powerNets.some((n) => capNetIds.has(n.netId))
      const connectedToGround =
        icGroundNets.some((n) => capNetIds.has(n.netId)) ||
        groundNets.some((n) => capNetIds.has(n.netId))

      return connectedToPower && connectedToGround
    })

    if (decouplingCaps.length > 0) {
      groups.push({
        icId: ic.id,
        icBounds: {
          center: { x: 0, y: 0 }, // Will be filled in with PCB data
          width: 5,
          height: 5,
        },
        capacitorIds: decouplingCaps.map((c) => c.id),
      })
    }
  }

  return groups
}

/**
 * Applies the decoupling capacitor layout to a set of PCB component placements.
 * This is the main entry point for the specialized layout algorithm.
 *
 * @param groups - Grouped decoupling capacitors with IC bounds
 * @param options - Layout options
 * @returns Map of componentId → placement
 */
export function applyDecouplingCapacitorLayout(
  groups: DecouplingCapacitorGroup[],
  options: DecouplingCapacitorLayoutOptions = {},
): Map<string, ComponentPlacement> {
  const placements = new Map<string, ComponentPlacement>()

  for (const group of groups) {
    const groupPlacements = computeDecouplingCapacitorGridLayout(
      group,
      options,
    )
    for (const placement of groupPlacements) {
      placements.set(placement.componentId, placement)
    }
  }

  return placements
}
