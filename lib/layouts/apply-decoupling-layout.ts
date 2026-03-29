/**
 * apply-decoupling-layout.ts
 *
 * Integrates the decoupling capacitor layout algorithm with the matchpack
 * circuit-soup / soup-element pipeline.
 *
 * Given a parsed circuit soup (array of elements), this function:
 *   1. Finds the primary IC component.
 *   2. Identifies its power/ground pins.
 *   3. Finds the decoupling capacitors connected to those pins.
 *   4. Calls layoutDecouplingCapacitors() to compute optimal positions.
 *   5. Returns a new soup with updated pcb_component positions/rotations for
 *      every decoupling capacitor.
 *
 * Issue: https://github.com/tscircuit/matchpack/issues/15
 */

import {
  layoutDecouplingCapacitors,
  isPowerNet,
  type ComponentBounds,
  type PinInfo,
  type DecouplingCapacitorLayoutOptions,
} from "./decoupling-capacitor-layout"

// ---------------------------------------------------------------------------
// Minimal soup element types (mirrors what tscircuit uses)
// ---------------------------------------------------------------------------

interface SoupElement {
  type: string
  [key: string]: unknown
}

interface PcbComponent extends SoupElement {
  type: "pcb_component"
  pcb_component_id: string
  source_component_id: string
  center: { x: number; y: number }
  width: number
  height: number
  rotation: number
  layer: string
}

interface SourceComponent extends SoupElement {
  type: "source_component"
  source_component_id: string
  name: string
  ftype?: string
  // Additional fields vary by component type
}

interface SourcePort extends SoupElement {
  type: "source_port"
  source_port_id: string
  source_component_id: string
  name: string
  pin_number?: number
}

interface SourceNet extends SoupElement {
  type: "source_net"
  source_net_id: string
  name: string
}

interface SourceTrace extends SoupElement {
  type: "source_trace"
  source_trace_id: string
  connected_source_port_ids: string[]
  connected_source_net_ids: string[]
}

interface PcbPort extends SoupElement {
  type: "pcb_port"
  pcb_port_id: string
  source_port_id: string
  pcb_component_id: string
  x: number
  y: number
  layers: string[]
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export interface ApplyDecouplingLayoutOptions
  extends DecouplingCapacitorLayoutOptions {
  /**
   * source_component_id of the main IC to process.
   * If omitted, the function attempts to auto-detect the largest / primary IC.
   */
  icComponentId?: string

  /**
   * Names (or regexes) of component types to treat as decoupling capacitors.
   * Defaults to any component whose ftype/name includes "cap" or "C".
   */
  capComponentIds?: string[]
}

/**
 * Apply a clean decoupling-capacitor layout to a matchpack soup.
 *
 * Returns a new soup array with updated `pcb_component` positions/rotations
 * for all identified decoupling capacitors.
 */
export function applyDecouplingLayout(
  soup: SoupElement[],
  options: ApplyDecouplingLayoutOptions = {},
): SoupElement[] {
  const { icComponentId, capComponentIds, ...layoutOptions } = options

  // Index elements by type for fast lookup
  const byType = groupByType(soup)

  const pcbComponents = (byType["pcb_component"] ?? []) as PcbComponent[]
  const sourceComponents = (byType["source_component"] ??
    []) as SourceComponent[]
  const sourcePorts = (byType["source_port"] ?? []) as SourcePort[]
  const sourceNets = (byType["source_net"] ?? []) as SourceNet[]
  const sourceTraces = (byType["source_trace"] ?? []) as SourceTrace[]
  const pcbPorts = (byType["pcb_port"] ?? []) as PcbPort[]

  // ---- 1. Find the IC -------------------------------------------------
  const ic = findIC(sourceComponents, pcbComponents, icComponentId)
  if (!ic) {
    // Nothing to do
    return soup
  }

  const icPcb = pcbComponents.find(
    (c) => c.source_component_id === ic.source_component_id,
  )
  if (!icPcb) return soup

  const chipBounds: ComponentBounds = {
    centre: { x: icPcb.center.x, y: icPcb.center.y },
    width: icPcb.width,
    height: icPcb.height,
  }

  // ---- 2. Build a net-name index for port → net name ------------------
  const portNetName = buildPortNetIndex(sourcePorts, sourceNets, sourceTraces)

  // ---- 3. Identify power ports on the IC ------------------------------
  const icSourcePorts = sourcePorts.filter(
    (p) => p.source_component_id === ic.source_component_id,
  )

  const powerPorts = icSourcePorts.filter((p) => {
    const net = portNetName[p.source_port_id]
    return net ? isPowerNet(net) : false
  })

  if (powerPorts.length === 0) return soup

  // ---- 4. Build PinInfo for each power port ---------------------------
  const icPcbPorts = pcbPorts.filter((pp) => pp.pcb_component_id === icPcb.pcb_component_id)

  const pins: PinInfo[] = powerPorts.flatMap((sp) => {
    const pcbPort = icPcbPorts.find((pp) => pp.source_port_id === sp.source_port_id)
    if (!pcbPort) return []

    const side = classifySide(
      { x: pcbPort.x, y: pcbPort.y },
      chipBounds,
    )
    const net = portNetName[sp.source_port_id] ?? ""

    return [
      {
        pinNumber: sp.pin_number ?? derivePin(sp.name),
        net,
        position: { x: pcbPort.x, y: pcbPort.y },
        side,
      } satisfies PinInfo,
    ]
  })

  if (pins.length === 0) return soup

  // ---- 5. Find decoupling capacitors connected to those power nets -----
  const powerNetIds = new Set<string>()
  for (const sp of powerPorts) {
    const netId = findNetId(sp.source_port_id, sourceTraces)
    if (netId) powerNetIds.add(netId)
  }

  // Map: source_component_id → the power pin it decouples
  const decapMap = buildDecapMap(
    sourceComponents,
    sourcePorts,
    sourceTraces,
    powerNetIds,
    ic.source_component_id,
    capComponentIds,
  )

  if (decapMap.size === 0) return soup

  // ---- 6. Run layout --------------------------------------------------
  // Create a pin entry per decoupling cap (using the IC power pin position)
  const capPins: PinInfo[] = []
  for (const [capSrcId, pinInfo] of decapMap.entries()) {
    capPins.push({ ...pinInfo, pinNumber: hashString(capSrcId) })
  }

  const placements = layoutDecouplingCapacitors(chipBounds, capPins, layoutOptions)

  // ---- 7. Apply placements back to soup elements ----------------------
  const updatedIds = new Set<string>()
  const capSrcIds = [...decapMap.keys()]

  const newSoup = soup.map((el) => {
    if (el.type !== "pcb_component") return el
    const pcbComp = el as PcbComponent
    const srcId = pcbComp.source_component_id
    const idx = capSrcIds.indexOf(srcId)
    if (idx === -1) return el

    const placement = placements[idx]
    if (!placement) return el

    updatedIds.add(srcId)
    return {
      ...pcbComp,
      center: placement.position,
      rotation: placement.rotation,
    } as PcbComponent
  })

  return newSoup
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByType(
  soup: SoupElement[],
): Record<string, SoupElement[]> {
  const result: Record<string, SoupElement[]> = {}
  for (const el of soup) {
    if (!result[el.type]) result[el.type] = []
    result[el.type].push(el)
  }
  return result
}

function findIC(
  sourceComponents: SourceComponent[],
  pcbComponents: PcbComponent[],
  icComponentId?: string,
): SourceComponent | undefined {
  if (icComponentId) {
    return sourceComponents.find(
      (c) => c.source_component_id === icComponentId,
    )
  }

  // Heuristic: the component with the largest pcb footprint area is the IC
  let best: SourceComponent | undefined
  let bestArea = -1

  for (const sc of sourceComponents) {
    const pcb = pcbComponents.find(
      (p) => p.source_component_id === sc.source_component_id,
    )
    if (!pcb) continue
    const area = pcb.width * pcb.height
    if (area > bestArea) {
      bestArea = area
      best = sc
    }
  }

  return best
}

function buildPortNetIndex(
  sourcePorts: SourcePort[],
  sourceNets: SourceNet[],
  sourceTraces: SourceTrace[],
): Record<string, string> {
  const netIdToName: Record<string, string> = {}
  for (const net of sourceNets) {
    netIdToName[net.source_net_id] = net.name
  }

  const portToNet: Record<string, string> = {}
  for (const trace of sourceTraces) {
    const netIds = trace.connected_source_net_ids
    const portIds = trace.connected_source_port_ids
    for (const netId of netIds) {
      const netName = netIdToName[netId]
      if (!netName) continue
      for (const portId of portIds) {
        portToNet[portId] = netName
      }
    }
  }

  return portToNet
}

function findNetId(
  portId: string,
  sourceTraces: SourceTrace[],
): string | undefined {
  for (const trace of sourceTraces) {
    if (trace.connected_source_port_ids.includes(portId)) {
      return trace.connected_source_net_ids[0]
    }
  }
  return undefined
}

/**
 * Determine which side of the chip a port falls on, based on proximity to each
 * edge of the chip bounding box.
 */
function classifySide(
  portPos: { x: number; y: number },
  chip: ComponentBounds,
): "top" | "bottom" | "left" | "right" {
  const dx = portPos.x - chip.centre.x
  const dy = portPos.y - chip.centre.y

  const fromRight = chip.width / 2 - Math.abs(dx)
  const fromTop = chip.height / 2 - Math.abs(dy)

  if (fromRight < fromTop) {
    return dx > 0 ? "right" : "left"
  } else {
    return dy > 0 ? "top" : "bottom"
  }
}

/**
 * Build a map from decoupling-capacitor source_component_id → PinInfo of the
 * IC power pin it is associated with.
 *
 * A component is considered a decoupling capacitor if:
 *   - It is in capComponentIds (if provided), OR
 *   - Its name starts with "C" and it has exactly two ports, one of which
 *     is connected to a power net of the IC.
 */
function buildDecapMap(
  sourceComponents: SourceComponent[],
  sourcePorts: SourcePort[],
  sourceTraces: SourceTrace[],
  powerNetIds: Set<string>,
  icSrcId: string,
  capComponentIds?: string[],
): Map<string, PinInfo> {
  const result = new Map<string, PinInfo>()

  const capSet = capComponentIds ? new Set(capComponentIds) : null

  // Build port → netId index
  const portToNetId: Record<string, string> = {}
  for (const trace of sourceTraces) {
    for (const portId of trace.connected_source_port_ids) {
      if (trace.connected_source_net_ids[0]) {
        portToNetId[portId] = trace.connected_source_net_ids[0]
      }
    }
  }

  const portsByComponent: Record<string, SourcePort[]> = {}
  for (const port of sourcePorts) {
    if (!portsByComponent[port.source_component_id]) {
      portsByComponent[port.source_component_id] = []
    }
    portsByComponent[port.source_component_id].push(port)
  }

  for (const sc of sourceComponents) {
    if (sc.source_component_id === icSrcId) continue

    const isCapByList = capSet?.has(sc.source_component_id)
    const isCapByName =
      !capSet &&
      typeof sc.name === "string" &&
      /^C\d*$|^cap/i.test(sc.name)

    if (!isCapByList && !isCapByName) continue

    const ports = portsByComponent[sc.source_component_id] ?? []
    if (ports.length !== 2) continue

    for (const port of ports) {
      const netId = portToNetId[port.source_port_id]
      if (netId && powerNetIds.has(netId)) {
        // This capacitor is connected to a power net — it's a decoupling cap
        // Use a placeholder PinInfo; actual position will be the IC pin position
        // (resolved during layoutDecouplingCapacitors call)
        result.set(sc.source_component_id, {
          pinNumber: hashString(sc.source_component_id),
          net: netId,
          position: { x: 0, y: 0 }, // placeholder
          side: "top", // placeholder — overridden by actual pin position
        })
        break
      }
    }
  }

  return result
}

function derivePin(name: string): number {
  const m = name.match(/\d+/)
  return m ? parseInt(m[0], 10) : 0
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
