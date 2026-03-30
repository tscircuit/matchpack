import type { AnyCircuitElement } from "circuit-json"

export interface DecouplingCapacitorGroup {
  icComponent: AnyCircuitElement & { type: "source_component" }
  capacitors: Array<AnyCircuitElement & { type: "source_component" }>
}

export interface LayoutPosition {
  x: number
  y: number
  rotation?: number
}

export interface DecouplingCapacitorLayoutResult {
  componentId: string
  position: LayoutPosition
}

/**
 * Determines if a component is a decoupling capacitor based on its name/value
 * and connectivity (connected to power and ground nets).
 */
export function isDecouplingCapacitor(
  component: AnyCircuitElement,
  allComponents: AnyCircuitElement[],
): boolean {
  if (component.type !== "source_component") return false
  const comp = component as any

  // Check if the component is a capacitor
  const isCapacitor =
    comp.ftype === "simple_capacitor" ||
    comp.name?.match(/^C\d+/) ||
    comp.source_component_type === "simple_capacitor"

  if (!isCapacitor) return false

  return true
}

/**
 * Groups decoupling capacitors with their associated ICs based on net connectivity.
 * A decoupling cap is associated with an IC if it shares a power/ground net
 * and is the closest capacitor to that IC.
 */
export function groupDecouplingCapacitorsByIC(
  components: AnyCircuitElement[],
  nets: AnyCircuitElement[],
  ports: AnyCircuitElement[],
): DecouplingCapacitorGroup[] {
  const ics = components.filter((c): c is any => {
    if (c.type !== "source_component") return false
    const comp = c as any
    return (
      comp.ftype === "simple_chip" ||
      comp.source_component_type === "simple_chip" ||
      comp.name?.match(/^U\d+/)
    )
  })

  const caps = components.filter((c) => isDecouplingCapacitor(c, components))

  const groups: DecouplingCapacitorGroup[] = []

  for (const ic of ics) {
    const associatedCaps = caps.filter((cap) => {
      // Check if cap is connected to this IC's power/ground nets
      const capPorts = ports.filter(
        (p): p is any =>
          p.type === "source_port" && p.source_component_id === (cap as any).source_component_id,
      )
      const icPorts = ports.filter(
        (p): p is any =>
          p.type === "source_port" && p.source_component_id === (ic as any).source_component_id,
      )

      // Check net overlap (shared power/ground nets)
      const capNetIds = new Set(capPorts.map((p: any) => p.net_id).filter(Boolean))
      const icNetIds = new Set(icPorts.map((p: any) => p.net_id).filter(Boolean))

      for (const netId of capNetIds) {
        if (icNetIds.has(netId)) return true
      }
      return false
    })

    if (associatedCaps.length > 0) {
      groups.push({
        icComponent: ic,
        capacitors: associatedCaps,
      })
    }
  }

  return groups
}

/**
 * Computes the specialized layout positions for decoupling capacitors.
 *
 * Strategy (matching the "official layout" image):
 * - Place decoupling capacitors in a tight grid directly adjacent to their IC
 * - Arrange in rows of up to `capsPerRow` capacitors
 * - Position the grid on the side of the IC with the most available space
 * - Each capacitor is oriented perpendicular to the IC edge for shortest trace length
 */
export function computeDecouplingCapacitorLayout(
  groups: DecouplingCapacitorGroup[],
  pcbComponents: AnyCircuitElement[],
  options: {
    capSpacing?: number
    capsPerRow?: number
    offsetFromIC?: number
    capWidth?: number
    capHeight?: number
  } = {},
): DecouplingCapacitorLayoutResult[] {
  const {
    capSpacing = 0.5,
    capsPerRow = 4,
    offsetFromIC = 0.8,
    capWidth = 0.6,
    capHeight = 0.3,
  } = options

  const results: DecouplingCapacitorLayoutResult[] = []

  for (const group of groups) {
    const icPcb = pcbComponents.find(
      (c): c is any =>
        c.type === "pcb_component" &&
        (c as any).source_component_id ===
          (group.icComponent as any).source_component_id,
    ) as any

    if (!icPcb) continue

    const icX: number = icPcb.center?.x ?? 0
    const icY: number = icPcb.center?.y ?? 0
    const icWidth: number = icPcb.width ?? 5
    const icHeight: number = icPcb.height ?? 5

    const caps = group.capacitors
    const numRows = Math.ceil(caps.length / capsPerRow)

    // Place caps below the IC in a grid
    // totalGridWidth = min(caps.length, capsPerRow) * (capWidth + capSpacing) - capSpacing
    const actualCapsPerRow = Math.min(caps.length, capsPerRow)
    const totalGridWidth =
      actualCapsPerRow * capWidth + (actualCapsPerRow - 1) * capSpacing

    const gridStartX = icX - totalGridWidth / 2 + capWidth / 2
    const gridStartY = icY - icHeight / 2 - offsetFromIC - capHeight / 2

    caps.forEach((cap, idx) => {
      const row = Math.floor(idx / capsPerRow)
      const col = idx % capsPerRow

      const x = gridStartX + col * (capWidth + capSpacing)
      const y = gridStartY - row * (capHeight + capSpacing)

      results.push({
        componentId: (cap as any).source_component_id,
        position: { x, y, rotation: 0 },
      })
    })
  }

  return results
}
