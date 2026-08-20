/**
 * High-level helper: given a list of circuit elements (in circuit-json format),
 * automatically identify decoupling capacitors, group them by associated IC,
 * and apply the specialized tidy layout to make the board less messy.
 *
 * This is the main entry point that integrates all pieces of the decoupling-cap
 * layout feature (issue #15).
 */

import type { AnyCircuitElement } from "circuit-json"
import { identifyDecouplingCapacitors } from "./identify-decoupling-capacitors"
import {
  computeDecouplingCapGroupLayout,
  type DecouplingCapGroupLayoutOptions,
  type GroupSide,
} from "./decoupling-cap-group-layout"

export interface ApplyDecouplingCapLayoutOptions
  extends DecouplingCapGroupLayoutOptions {
  /**
   * Override the side used per IC. Key is source_component_id of the IC.
   */
  sideOverrides?: Record<string, GroupSide>
}

/**
 * Returns a new elements array with decoupling capacitor PCB positions updated
 * to use the tidy official-style layout.
 *
 * PCB component positions are updated; schematic positions are left unchanged.
 */
export function applyDecouplingCapLayout(
  elements: AnyCircuitElement[],
  options: ApplyDecouplingCapLayoutOptions = {},
): AnyCircuitElement[] {
  const { sideOverrides = {}, ...layoutOptions } = options

  // Step 1: identify which source_components are decoupling caps and map them to ICs
  const { icToCapacitorsMap } = identifyDecouplingCapacitors(elements)

  if (icToCapacitorsMap.size === 0) return elements

  // Build a lookup from source_component_id → pcb_component
  const pcbBySourceId = new Map<string, AnyCircuitElement>()
  for (const el of elements) {
    if (el.type === "pcb_component") {
      const sourceId = (el as any).source_component_id
      if (sourceId) pcbBySourceId.set(sourceId, el)
    }
  }

  // Build mutable update map: pcb_component_id → partial update
  type PcbUpdate = { center: { x: number; y: number }; rotation: number }
  const updates = new Map<string, PcbUpdate>()

  // Step 2: for each IC group, compute and record cap placements
  for (const [icSourceId, capSourceIds] of icToCapacitorsMap.entries()) {
    const icPcb = pcbBySourceId.get(icSourceId)
    if (!icPcb) continue

    const icX: number = (icPcb as any).center?.x ?? 0
    const icY: number = (icPcb as any).center?.y ?? 0
    const icWidth: number = (icPcb as any).width ?? 4
    const icHeight: number = (icPcb as any).height ?? 4

    const side: GroupSide =
      sideOverrides[icSourceId] ?? layoutOptions.side ?? "bottom"

    const placements = computeDecouplingCapGroupLayout(
      { x: icX, y: icY, width: icWidth, height: icHeight },
      capSourceIds.length,
      { ...layoutOptions, side },
    )

    for (let i = 0; i < capSourceIds.length; i++) {
      const capSourceId = capSourceIds[i]
      const capPcb = pcbBySourceId.get(capSourceId)
      if (!capPcb) continue

      const pcbCompId: string =
        (capPcb as any).pcb_component_id ?? ""
      if (!pcbCompId) continue

      updates.set(pcbCompId, {
        center: { x: placements[i].x, y: placements[i].y },
        rotation: placements[i].rotation,
      })
    }
  }

  if (updates.size === 0) return elements

  // Step 3: return updated elements array (immutable)
  return elements.map((el) => {
    if (el.type !== "pcb_component") return el
    const id: string = (el as any).pcb_component_id ?? ""
    const update = updates.get(id)
    if (!update) return el
    return { ...el, ...update } as AnyCircuitElement
  })
}
