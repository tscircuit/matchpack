/**
 * apply-decoupling-layout.ts
 *
 * Integrates `layoutDecouplingCapacitors` with the matchpack "soup" element
 * format.  Reads `source_component`, `source_port`, `source_net`, and
 * `source_trace` elements to:
 *
 *   1. Identify which source components are decoupling capacitors
 *      (`buildDecapMap`).
 *   2. Resolve the reference IC power-pin position/side for each decap from
 *      the IC ports that share the same net (`buildIcPowerPinsByNetId`).
 *   3. Run the placement algorithm.
 *   4. Write the resulting `x/y/rotation` back to the corresponding
 *      `pcb_component` elements.
 */

import {
  layoutDecouplingCapacitors,
  filterDecouplingPins,
  isPowerNet,
  type PinInfo,
  type Side,
  type DecapPlacement,
  type DecapLayoutOptions,
} from "./decoupling-capacitor-layout"

// ---------------------------------------------------------------------------
// Soup element type stubs
// (matchpack's actual soup types are duck-typed; we only reference the fields
//  we need so the file stays self-contained.)
// ---------------------------------------------------------------------------

interface SourceComponent {
  source_component_id: string
  name?: string
  /** e.g. "capacitor", "resistor", "chip", … */
  ftype?: string
  supplier_part_numbers?: Record<string, string[]>
  properties?: Record<string, string>
}

interface SourcePort {
  source_port_id: string
  source_component_id: string
  name?: string
  pin_number?: number
  /** Pre-computed position (present on IC ports when schematic has been laid out) */
  position?: { x: number; y: number }
  /** Which side of the package this port is on */
  side?: Side
}

interface SourceNet {
  source_net_id: string
  name: string
}

interface SourceTrace {
  source_trace_id: string
  connected_source_port_ids: string[]
  connected_source_net_id?: string
}

interface PcbComponent {
  pcb_component_id: string
  source_component_id: string
  center?: { x: number; y: number }
  x?: number
  y?: number
  rotation?: number
  layer?: string
}

export interface SoupElements {
  source_components?: SourceComponent[]
  source_ports?: SourcePort[]
  source_nets?: SourceNet[]
  source_traces?: SourceTrace[]
  pcb_components?: PcbComponent[]
}

// ---------------------------------------------------------------------------
// Helper: stable integer hash for a string (used as fallback pinNumber)
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// ---------------------------------------------------------------------------
// Helper: determine whether a SourceComponent looks like a capacitor
// ---------------------------------------------------------------------------

function isCapacitor(sc: SourceComponent): boolean {
  if (sc.ftype?.toLowerCase().includes("capacitor")) return true
  if (sc.name?.toLowerCase().startsWith("c")) return true
  return false
}

// ---------------------------------------------------------------------------
// Helper: determine whether a SourceComponent looks like an IC / chip
// ---------------------------------------------------------------------------

function isIc(sc: SourceComponent): boolean {
  const ftype = sc.ftype?.toLowerCase() ?? ""
  return (
    ftype.includes("chip") ||
    ftype.includes("ic") ||
    ftype.includes("microcontroller") ||
    ftype.includes("mcu") ||
    ftype.includes("fpga") ||
    ftype.includes("regulator") ||
    ftype === "simple_chip"
  )
}

// ---------------------------------------------------------------------------
// Build a map: netId → PinInfo for IC power pins
// ---------------------------------------------------------------------------

/**
 * Scans all IC source_ports that belong to a power net and returns a map
 * keyed by `source_net_id`.  Only the *first* IC power port found for each
 * net is stored; later decaps on the same net reuse that reference position.
 *
 * If a net has multiple IC power pins (e.g. several VDD pins) the algorithm
 * will still place each decap relative to the closest pin — but resolving
 * "closest" requires PCB coordinates which may not yet be available.  As a
 * pragmatic fallback we use the first match.
 */
function buildIcPowerPinsByNetId(
  elements: SoupElements,
): Map<string, PinInfo> {
  const {
    source_components = [],
    source_ports = [],
    source_nets = [],
    source_traces = [],
  } = elements

  // Index
  const netById = new Map<string, SourceNet>(
    source_nets.map((n) => [n.source_net_id, n]),
  )
  const portById = new Map<string, SourcePort>(
    source_ports.map((p) => [p.source_port_id, p]),
  )
  const icIds = new Set<string>(
    source_components.filter(isIc).map((c) => c.source_component_id),
  )

  // For each trace that connects to a power net, find any IC port on that net.
  const result = new Map<string, PinInfo>()

  for (const trace of source_traces) {
    const { connected_source_net_id: netId, connected_source_port_ids: portIds } =
      trace
    if (!netId) continue
    const net = netById.get(netId)
    if (!net || !isPowerNet(net.name)) continue

    for (const portId of portIds) {
      const port = portById.get(portId)
      if (!port) continue
      if (!icIds.has(port.source_component_id)) continue

      // We have an IC port on a power net.
      if (result.has(netId)) continue // already recorded one for this net

      result.set(netId, {
        pinNumber: port.pin_number ?? hashString(portId),
        net: net.name,
        position: port.position ?? { x: 0, y: 0 },
        side: port.side ?? "top",
      })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Build the decap map consumed by layoutDecouplingCapacitors
// ---------------------------------------------------------------------------

/**
 * For each capacitor source component that is connected to a power net,
 * builds a `PinInfo` record anchored to the IC power pin on that same net.
 *
 * The `position` and `side` fields come from `icPowerPinsByNetId` so that
 * the layout algorithm places every decap adjacent to the real IC pin rather
 * than at the origin.
 */
export function buildDecapMap(
  elements: SoupElements,
): Map<string, PinInfo> {
  const {
    source_components = [],
    source_nets = [],
    source_traces = [],
    source_ports = [],
  } = elements

  const netById = new Map<string, SourceNet>(
    source_nets.map((n) => [n.source_net_id, n]),
  )
  // Map source_component_id → its ports
  const portsByComponent = new Map<string, SourcePort[]>()
  for (const port of source_ports) {
    const arr = portsByComponent.get(port.source_component_id) ?? []
    arr.push(port)
    portsByComponent.set(port.source_component_id, arr)
  }

  // Resolve IC power-pin reference positions for every power net.
  const icPowerPinsByNetId = buildIcPowerPinsByNetId(elements)

  // Build a quick lookup: portId → netId (from traces)
  const netIdByPortId = new Map<string, string>()
  for (const trace of source_traces) {
    if (!trace.connected_source_net_id) continue
    for (const portId of trace.connected_source_port_ids) {
      netIdByPortId.set(portId, trace.connected_source_net_id)
    }
  }

  const result = new Map<string, PinInfo>()

  for (const sc of source_components) {
    if (!isCapacitor(sc)) continue

    const ports = portsByComponent.get(sc.source_component_id) ?? []

    // A decoupling cap has at least one port connected to a power net.
    // Find the first such port.
    let powerNetId: string | undefined
    for (const port of ports) {
      const netId = netIdByPortId.get(port.source_port_id)
      if (!netId) continue
      const net = netById.get(netId)
      if (net && isPowerNet(net.name)) {
        powerNetId = netId
        break
      }
    }

    if (!powerNetId) continue // not a decoupling cap

    const net = netById.get(powerNetId)!

    // Resolve the IC power-pin info for this net.
    // This gives us the real position + side so the placement is anchored
    // to the correct IC pin rather than defaulting to (0,0) / "top".
    const icPinInfo = icPowerPinsByNetId.get(powerNetId)

    result.set(sc.source_component_id, {
      pinNumber: icPinInfo?.pinNumber ?? hashString(sc.source_component_id),
      net: net.name,
      position: icPinInfo?.position ?? { x: 0, y: 0 },
      side: icPinInfo?.side ?? "top",
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Runs the full decoupling-capacitor layout pass on `elements`:
 *
 * 1. Builds the decap map (with real IC pin positions/sides).
 * 2. Calls `layoutDecouplingCapacitors`.
 * 3. Applies the resulting placements to `pcb_components` in-place.
 *
 * Returns the list of computed placements (useful for testing / previewing).
 */
export function applyDecouplingLayout(
  elements: SoupElements,
  options: DecapLayoutOptions = {},
): DecapPlacement[] {
  const decapMap = buildDecapMap(elements)

  // Filter to only power-net-connected decaps (redundant given buildDecapMap,
  // but keeps the pipeline explicit and matches the filterDecouplingPins API).
  const filteredMap = new Map<string, PinInfo>()
  for (const [id, pinInfo] of decapMap) {
    if (isPowerNet(pinInfo.net)) {
      filteredMap.set(id, pinInfo)
    }
  }

  const placements = layoutDecouplingCapacitors(filteredMap, options)

  // Write placements back into pcb_components.
  if (elements.pcb_components) {
    const pcbById = new Map<string, PcbComponent>(
      elements.pcb_components.map((c) => [c.source_component_id, c]),
    )

    for (const placement of placements) {
      const pcb = pcbById.get(placement.componentId)
      if (!pcb) continue
      // Support both center-object and flat x/y formats.
      if (pcb.center !== undefined) {
        pcb.center = placement.position
      } else {
        pcb.x = placement.position.x
        pcb.y = placement.position.y
      }
      pcb.rotation = placement.rotation
    }
  }

  return placements
}
