import type { InputProblem } from "lib/types/InputProblem"
import type { CircuitJson } from "circuit-json"
import { cju } from "@tscircuit/circuit-json-util"

export const getInputProblemFromCircuitJsonSchematic = (
  circuitJson: CircuitJson,
  options?: { useReadableIds?: boolean }
): InputProblem => {
  const db = cju(circuitJson)
  const { useReadableIds = false } = options || {}

  // ID mapping for readable IDs
  const sourceComponentIdToReadableId = new Map<string, string>()
  const sourcePortIdToReadableId = new Map<string, string>()
  const readableIdToSourceComponentId = new Map<string, string>()
  const readableIdToSourcePortId = new Map<string, string>()

  const problem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    groupMap: {},
    groupPinMap: {},
    netMap: {},
    pinConnMap: {},
    netConnMap: {},
  }

  const cjChips = db.schematic_component.list().map((schematic_component) => ({
    schematic_component,
    source_component: db.source_component.get(
      schematic_component.source_component_id,
    ),
    ports: db.schematic_port
      .list({
        schematic_component_id: schematic_component.schematic_component_id,
      })
      .map((schematic_port) => ({
        schematic_port,
        source_port: db.source_port.get(schematic_port.source_port_id),
      })),
  }))

  const cjSourceTraces = db.source_trace.list()
  const cjSourceNets = db.source_net.list()

  // Extract schematic components as chips using cjChips which has size information
  for (const chip of cjChips) {
    const { schematic_component, source_component, ports } = chip

    if (!source_component) continue

    // Generate chip ID based on useReadableIds option
    const originalChipId = source_component.source_component_id
    const chipId = useReadableIds 
      ? (source_component.name || originalChipId)
      : originalChipId

    if (useReadableIds) {
      sourceComponentIdToReadableId.set(originalChipId, chipId)
      readableIdToSourceComponentId.set(chipId, originalChipId)
    }

    // Generate pin IDs based on useReadableIds option
    const pinIds = ports
      .map((p) => {
        if (!p.source_port) return null
        
        const originalPinId = p.source_port.source_port_id
        if (useReadableIds) {
          const readablePinId = `${chipId}.${p.source_port.pin_number || p.source_port.name || originalPinId.split('_').pop()}`
          sourcePortIdToReadableId.set(originalPinId, readablePinId)
          readableIdToSourcePortId.set(readablePinId, originalPinId)
          return readablePinId
        }
        return originalPinId
      })
      .filter(Boolean) as string[]

    problem.chipMap[chipId] = {
      chipId,
      pins: pinIds,
      size: {
        x: schematic_component.size?.width || 10,
        y: schematic_component.size?.height || 10,
      },
    }

    // Create chipPinMap entries for each pin
    for (const { schematic_port, source_port } of ports) {
      if (source_port) {
        // Convert facing direction to side
        let side: "x-" | "x+" | "y-" | "y+" = "y+" // Default
        if (schematic_port.facing_direction) {
          switch (schematic_port.facing_direction) {
            case "up":
              side = "y+"
              break
            case "down":
              side = "y-"
              break
            case "left":
              side = "x-"
              break
            case "right":
              side = "x+"
              break
            default:
              side = "y+"
          }
        }

        // Use readable pin ID if enabled
        const originalPinId = source_port.source_port_id
        const pinId = useReadableIds 
          ? sourcePortIdToReadableId.get(originalPinId) || originalPinId
          : originalPinId

        problem.chipPinMap[pinId] = {
          pinId,
          offset: {
            x:
              (schematic_port.center?.x || 0) -
              (schematic_component.center.x || 0),
            y:
              (schematic_port.center?.y || 0) -
              (schematic_component.center.y || 0),
          },
          side,
        }
      }
    }
  }

  // Extract nets from source traces and source nets
  for (const sourceNet of cjSourceNets) {
    problem.netMap[sourceNet.source_net_id] = {
      netId: sourceNet.source_net_id,
    }
  }

  // Create connections based on source traces
  for (const sourceTrace of cjSourceTraces) {
    const connectedPorts = sourceTrace.connected_source_port_ids || []
    const connectedNets = sourceTrace.connected_source_net_ids || []

    // Create pin-to-pin connections
    for (let i = 0; i < connectedPorts.length; i++) {
      for (let j = i + 1; j < connectedPorts.length; j++) {
        const originalPin1 = connectedPorts[i]
        const originalPin2 = connectedPorts[j]
        
        const pin1 = useReadableIds 
          ? sourcePortIdToReadableId.get(originalPin1) || originalPin1
          : originalPin1
        const pin2 = useReadableIds 
          ? sourcePortIdToReadableId.get(originalPin2) || originalPin2
          : originalPin2
          
        problem.pinConnMap[`${pin1}-${pin2}`] = true
        problem.pinConnMap[`${pin2}-${pin1}`] = true
      }
    }

    // Create pin-to-net connections
    for (const originalPinId of connectedPorts) {
      const pinId = useReadableIds 
        ? sourcePortIdToReadableId.get(originalPinId) || originalPinId
        : originalPinId
        
      for (const netId of connectedNets) {
        problem.netConnMap[`${pinId}-${netId}`] = true
      }
    }
  }

  // Also check connectivity via subcircuit_connectivity_map_key
  const portsByConnectivityKey: Record<string, string[]> = {}

  for (const chip of cjChips) {
    for (const { source_port } of chip.ports) {
      if (source_port && source_port.subcircuit_connectivity_map_key) {
        if (
          !portsByConnectivityKey[source_port.subcircuit_connectivity_map_key]
        ) {
          portsByConnectivityKey[source_port.subcircuit_connectivity_map_key] =
            []
        }
        
        const originalPinId = source_port.source_port_id
        const pinId = useReadableIds 
          ? sourcePortIdToReadableId.get(originalPinId) || originalPinId
          : originalPinId
          
        portsByConnectivityKey[
          source_port.subcircuit_connectivity_map_key
        ]!.push(pinId)
      }
    }
  }

  // Create pin-to-pin connections for ports with same connectivity key
  for (const pinIds of Object.values(portsByConnectivityKey)) {
    for (let i = 0; i < pinIds.length; i++) {
      for (let j = i + 1; j < pinIds.length; j++) {
        const pin1 = pinIds[i]
        const pin2 = pinIds[j]
        problem.pinConnMap[`${pin1}-${pin2}`] = true
        problem.pinConnMap[`${pin2}-${pin1}`] = true
      }
    }
  }

  return problem
}
