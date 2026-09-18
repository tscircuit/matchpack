import type { AnyCircuitElement, SchematicComponent, PcbComponent } from "circuit-json"

export interface DecouplingCapacitorGroup {
  /** The IC component that the capacitors are associated with */
  icComponent: SchematicComponent & PcbComponent
  /** The decoupling capacitors associated with this IC */
  capacitors: Array<SchematicComponent & PcbComponent>
}

export interface DecouplingCapacitorLayoutOptions {
  /** Distance between capacitor and IC edge in mm (default: 0.5) */
  offsetFromIc?: number
  /** Gap between capacitors in mm (default: 0.3) */
  capacitorGap?: number
  /** Which side to place capacitors relative to IC (default: "auto") */
  side?: "top" | "bottom" | "left" | "right" | "auto"
  /** Whether to place capacitors on the same layer as the IC (default: true) */
  sameLayer?: boolean
}

export interface DecouplingCapacitorPlacement {
  componentId: string
  x: number
  y: number
  rotation: number
  layer: string
}

/**
 * Computes an organized layout for decoupling capacitors around their
 * associated IC component. This implements the "official layout" pattern
 * where capacitors are neatly arranged in a row close to their IC's power pins.
 */
export function computeDecouplingCapacitorLayout(
  group: DecouplingCapacitorGroup,
  options: DecouplingCapacitorLayoutOptions = {},
): DecouplingCapacitorPlacement[] {
  const {
    offsetFromIc = 0.5,
    capacitorGap = 0.3,
    side = "auto",
    sameLayer = true,
  } = options

  const { icComponent, capacitors } = group

  if (capacitors.length === 0) return []

  // Determine the IC bounds
  const icX = (icComponent as any).center?.x ?? (icComponent as any).x ?? 0
  const icY = (icComponent as any).center?.y ?? (icComponent as any).y ?? 0
  const icWidth = (icComponent as any).width ?? 2
  const icHeight = (icComponent as any).height ?? 2

  // Typical 0402/0603 decoupling cap footprint size
  const capWidth = 0.6
  const capHeight = 1.0

  // Determine placement side
  let placementSide = side
  if (placementSide === "auto") {
    // Default: place below the IC for a clean look matching "official layout"
    placementSide = "bottom"
  }

  const placements: DecouplingCapacitorPlacement[] = []
  const count = capacitors.length

  // Calculate total width needed for a row of capacitors
  const totalRowWidth = count * capWidth + (count - 1) * capacitorGap
  const startOffset = -totalRowWidth / 2 + capWidth / 2

  for (let i = 0; i < count; i++) {
    const cap = capacitors[i]
    const capLayer =
      sameLayer ? ((icComponent as any).layer ?? "top") : ((icComponent as any).layer ?? "top")

    let x: number
    let y: number
    let rotation: number

    switch (placementSide) {
      case "bottom": {
        // Row of capacitors below the IC, centered
        x = icX + startOffset + i * (capWidth + capacitorGap)
        y = icY - icHeight / 2 - offsetFromIc - capHeight / 2
        rotation = 0
        break
      }
      case "top": {
        // Row of capacitors above the IC, centered
        x = icX + startOffset + i * (capWidth + capacitorGap)
        y = icY + icHeight / 2 + offsetFromIc + capHeight / 2
        rotation = 0
        break
      }
      case "left": {
        // Column of capacitors to the left of the IC
        const totalColHeight = count * capHeight + (count - 1) * capacitorGap
        const startColOffset = -totalColHeight / 2 + capHeight / 2
        x = icX - icWidth / 2 - offsetFromIc - capWidth / 2
        y = icY + startColOffset + i * (capHeight + capacitorGap)
        rotation = 90
        break
      }
      case "right": {
        // Column of capacitors to the right of the IC
        const totalColHeight2 = count * capHeight + (count - 1) * capacitorGap
        const startColOffset2 = -totalColHeight2 / 2 + capHeight / 2
        x = icX + icWidth / 2 + offsetFromIc + capWidth / 2
        y = icY + startColOffset2 + i * (capHeight + capacitorGap)
        rotation = 90
        break
      }
      default: {
        x = icX + startOffset + i * (capWidth + capacitorGap)
        y = icY - icHeight / 2 - offsetFromIc - capHeight / 2
        rotation = 0
      }
    }

    placements.push({
      componentId: (cap as any).pcb_component_id ?? (cap as any).schematic_component_id ?? "",
      x,
      y,
      rotation,
      layer: capLayer,
    })
  }

  return placements
}

/**
 * Applies decoupling capacitor placements to PCB components in the circuit elements array.
 * Returns a new array with updated positions.
 */
export function applyDecouplingCapacitorLayout(
  elements: AnyCircuitElement[],
  placements: DecouplingCapacitorPlacement[],
): AnyCircuitElement[] {
  const placementMap = new Map(placements.map((p) => [p.componentId, p]))

  return elements.map((el) => {
    const id =
      (el as any).pcb_component_id ??
      (el as any).schematic_component_id ??
      ""
    const placement = placementMap.get(id)
    if (!placement) return el

    // Only update pcb_component elements
    if (el.type !== "pcb_component") return el

    return {
      ...el,
      center: { x: placement.x, y: placement.y },
      layer: placement.layer,
      rotation: placement.rotation,
    } as AnyCircuitElement
  })
}
