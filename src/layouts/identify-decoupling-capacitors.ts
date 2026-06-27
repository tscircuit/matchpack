import type { AnyCircuitElement } from "circuit-json"

export interface DecouplingCapacitorIdentification {
  /** Component IDs of identified decoupling capacitors */
  capacitorIds: string[]
  /** Map from capacitor ID to its associated IC component ID */
  capacitorToIcMap: Map<string, string>
  /** Map from IC component ID to its list of decoupling capacitor IDs */
  icToCapacitorsMap: Map<string, string[]>
}

const DECOUPLING_CAP_VALUE_PATTERN = /^(100n|0\.1u|100nf|0\.1uf|10n|10nf|1u|1uf|4\.7u|4\.7uf|10u|10uf|100u|100uf)/i
const DECOUPLING_CAP_REFERENCE_PATTERN = /^C\d+$/i
const CAPACITOR_SUPPLIER_PART_PATTERNS = [/^cap/i, /capacitor/i]

/**
 * Identifies decoupling capacitors in a circuit by analyzing:
 * 1. Component values (100nF, 0.1uF, 10nF, etc.)
 * 2. Net connections to VCC/GND power nets
 * 3. Proximity to IC components
 * 4. Reference designators (C1, C2, etc.)
 */
export function identifyDecouplingCapacitors(
  elements: AnyCircuitElement[],
): DecouplingCapacitorIdentification {
  const capacitorIds: string[] = []
  const capacitorToIcMap = new Map<string, string>()
  const icToCapacitorsMap = new Map<string, string[]>()

  // Collect all source components
  const sourceComponents = elements.filter((el) => el.type === "source_component")
  const sourceNets = elements.filter((el) => el.type === "source_net")
  const sourceTraces = elements.filter((el) => el.type === "source_trace")
  const sourcePorts = elements.filter((el) => el.type === "source_port")

  // Find power nets (VCC, VDD, GND, etc.)
  const powerNetIds = new Set<string>()
  for (const net of sourceNets) {
    const netName: string = (net as any).name ?? ""
    if (/^(vcc|vdd|v\d+|power|pwr|gnd|gnd_\d+|ground|vss)/i.test(netName)) {
      powerNetIds.add((net as any).source_net_id ?? "")
    }
  }

  // Find ICs
  const icComponentIds = new Set<string>()
  for (const comp of sourceComponents) {
    const ftype: string = (comp as any).ftype ?? ""
    const name: string = (comp as any).name ?? ""
    if (
      ftype === "simple_chip" ||
      ftype === "chip" ||
      /^(U|IC)\d+/i.test(name)
    ) {
      icComponentIds.add((comp as any).source_component_id ?? "")
    }
  }

  // Find capacitors
  for (const comp of sourceComponents) {
    const ftype: string = (comp as any).ftype ?? ""
    const name: string = (comp as any).name ?? ""
    const value: string = (comp as any).value ?? ""
    const compId: string = (comp as any).source_component_id ?? ""

    const isCapacitor =
      ftype === "simple_capacitor" ||
      ftype === "capacitor" ||
      CAPACITOR_SUPPLIER_PART_PATTERNS.some((p) => p.test(ftype)) ||
      DECOUPLING_CAP_REFERENCE_PATTERN.test(name)

    if (!isCapacitor) continue

    // Check if it's a decoupling cap value
    const isDecouplingValue = DECOUPLING_CAP_VALUE_PATTERN.test(value.trim())

    // Check if it's connected to a power net on one side and another net on the other
    const compPorts = sourcePorts.filter(
      (p) => (p as any).source_component_id === compId,
    )
    const connectedNets = new Set<string>()
    for (const port of compPorts) {
      const portId = (port as any).source_port_id ?? ""
      for (const trace of sourceTraces) {
        const connectedPortIds: string[] =
          (trace as any).connected_source_port_ids ?? []
        const connectedNetIds: string[] =
          (trace as any).connected_source_net_ids ?? []
        if (connectedPortIds.includes(portId)) {
          for (const netId of connectedNetIds) {
            connectedNets.add(netId)
          }
        }
      }
    }

    const connectedToPower = [...connectedNets].some((netId) =>
      powerNetIds.has(netId),
    )

    if (isDecouplingValue || connectedToPower) {
      capacitorIds.push(compId)
    }
  }

  // Associate capacitors with nearby ICs based on shared nets
  for (const capId of capacitorIds) {
    const capPorts = sourcePorts.filter(
      (p) => (p as any).source_component_id === capId,
    )
    const capNets = new Set<string>()

    for (const port of capPorts) {
      const portId = (port as any).source_port_id ?? ""
      for (const trace of sourceTraces) {
        const connectedPortIds: string[] =
          (trace as any).connected_source_port_ids ?? []
        const connectedNetIds: string[] =
          (trace as any).connected_source_net_ids ?? []
        if (connectedPortIds.includes(portId)) {
          for (const netId of connectedNetIds) {
            capNets.add(netId)
          }
        }
      }
    }

    // Find IC that shares a signal net with this capacitor
    let bestIcId: string | null = null
    let bestSharedNets = 0

    for (const icId of icComponentIds) {
      const icPorts = sourcePorts.filter(
        (p) => (p as any).source_component_id === icId,
      )
      const icNets = new Set<string>()

      for (const port of icPorts) {
        const portId = (port as any).source_port_id ?? ""
        for (const trace of sourceTraces) {
          const connectedPortIds: string[] =
            (trace as any).connected_source_port_ids ?? []
          const connectedNetIds: string[] =
            (trace as any).connected_source_net_ids ?? []
          if (connectedPortIds.includes(portId)) {
            for (const netId of connectedNetIds) {
              icNets.add(netId)
            }
          }
        }
      }

      // Count shared nets (prioritize non-power shared nets)
      let sharedCount = 0
      for (const netId of capNets) {
        if (icNets.has(netId)) sharedCount++
      }

      if (sharedCount > bestSharedNets) {
        bestSharedNets = sharedCount
        bestIcId = icId
      }
    }

    if (bestIcId) {
      capacitorToIcMap.set(capId, bestIcId)
      if (!icToCapacitorsMap.has(bestIcId)) {
        icToCapacitorsMap.set(bestIcId, [])
      }
      icToCapacitorsMap.get(bestIcId)!.push(capId)
    }
  }

  return { capacitorIds, capacitorToIcMap, icToCapacitorsMap }
}
