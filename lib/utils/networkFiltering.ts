/**
 * Utilities for filtering network connections during packing.
 * If any strong (pin-to-pin) connections exist, all weak (pin-to-net) connections
 * are filtered out for packing. Otherwise, weak connections are included with
 * basic opposite-side filtering to avoid conflicts with strong connections.
 */

import type { ChipPin, InputProblem, PinId } from "../types/InputProblem"

export interface NetworkFilteringResult {
  /** Map from pinId to networkId, with filtered networks marked as disconnected */
  pinToNetworkMap: Map<string, string>
  /** Set of pins whose weak connections were filtered (disconnected) */
  filteredPins: Set<string>
}

/**
 * Creates a network mapping for packing.
 * - If any strong (pin-to-pin) connections exist in the problem, all weak (pin-to-net)
 *   connections are filtered out (ignored) so packing is driven purely by strong links.
 * - If no strong connections exist, weak connections are included, with opposite-side
 *   filtering to avoid conflicts.
 */
export function createFilteredNetworkMapping(params: {
  inputProblem: InputProblem
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
}): NetworkFilteringResult {
  const { inputProblem, pinIdToStronglyConnectedPins } = params
  const pinToNetworkMap = new Map<string, string>()
  const filteredPins = new Set<string>()
  let hasStrongConnections = false

  // First, collect all strong connections to identify chip-to-chip relationships
  const strongConnectedChipSides = new Map<string, Set<string>>()

  for (const [connKey, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    hasStrongConnections = true
    const pins = connKey.split("-")
    if (pins.length === 2 && pins[0] && pins[1]) {
      const pin1 = inputProblem.chipPinMap[pins[0]]
      const pin2 = inputProblem.chipPinMap[pins[1]]

      if (pin1 && pin2) {
        const chip1Id = pins[0].split(".")[0]
        const chip2Id = pins[1].split(".")[0]

        if (chip1Id && chip2Id && chip1Id !== chip2Id) {
          const key1 = `${chip1Id}-${chip2Id}`
          const key2 = `${chip2Id}-${chip1Id}`

          if (!strongConnectedChipSides.has(key1)) {
            strongConnectedChipSides.set(key1, new Set())
          }
          if (!strongConnectedChipSides.has(key2)) {
            strongConnectedChipSides.set(key2, new Set())
          }

          strongConnectedChipSides.get(key1)!.add(pin1.side)
          strongConnectedChipSides.get(key2)!.add(pin2.side)
        }
      }
    }
  }

  // Process net connections
  if (hasStrongConnections) {
    // Filter out all weak (pin-to-net) connections when strong connections are present
    for (const [connKey, connected] of Object.entries(
      inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const [pinId, netId] = connKey.split("-")
      if (pinId && netId) {
        filteredPins.add(pinId)
      }
    }
  } else {
    // No strong connections; include weak connections with opposite-side filtering
    for (const [connKey, connected] of Object.entries(
      inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const [pinId, netId] = connKey.split("-")
      if (pinId && netId) {
        const pin = inputProblem.chipPinMap[pinId]
        if (!pin) continue

        const chipId = pinId.split(".")[0]
        let shouldIncludeInNetwork = true

        for (const [
          strongKey,
          strongSides,
        ] of strongConnectedChipSides.entries()) {
          const [fromChip, toChip] = strongKey.split("-")

          if (fromChip === chipId) {
            for (const [otherConnKey, otherConnected] of Object.entries(
              inputProblem.netConnMap,
            )) {
              if (!otherConnected) continue
              const [otherPinId, otherNetId] = otherConnKey.split("-")

              if (otherNetId === netId && otherPinId && otherPinId !== pinId) {
                const otherPin = inputProblem.chipPinMap[otherPinId]
                if (!otherPin) continue

                const otherChipId = otherPinId.split(".")[0]

                if (otherChipId === toChip) {
                  if (!strongSides.has(otherPin.side)) {
                    shouldIncludeInNetwork = false
                    break
                  }
                }
              }
            }
          }
        }

        if (shouldIncludeInNetwork) {
          pinToNetworkMap.set(pinId, netId)
        } else {
          const disconnectedNetworkId = `${pinId}_opposite-strong-side-disconnected`
          pinToNetworkMap.set(pinId, disconnectedNetworkId)
          filteredPins.add(pinId)
        }
      }
    }
  }

  // Process strong connections - these form their own networks
  for (const [connKey, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const pins = connKey.split("-")
    if (pins.length === 2 && pins[0] && pins[1]) {
      const existingNet =
        pinToNetworkMap.get(pins[0]) || pinToNetworkMap.get(pins[1])
      if (existingNet) {
        pinToNetworkMap.set(pins[0], existingNet)
        pinToNetworkMap.set(pins[1], existingNet)
      } else {
        pinToNetworkMap.set(pins[0], connKey)
        pinToNetworkMap.set(pins[1], connKey)
      }
    }
  }

  return {
    pinToNetworkMap,
    filteredPins,
  }
}

/**
 * Checks if a given net is a positive voltage source net (e.g., VCC, V+, VDD).
 * Uses the `isPositiveVoltageSource` flag from the net definition in the input problem.
 */
export function isPositiveVoltageNet(
  netId: string,
  inputProblem: InputProblem,
): boolean {
  const net = inputProblem.netMap[netId]
  if (!net) return false
  return net.isPositiveVoltageSource === true
}

