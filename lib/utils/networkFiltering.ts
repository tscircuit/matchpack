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
        // Extract chip IDs
        const chip1Id = pins[0].split(".")[0]
        const chip2Id = pins[1].split(".")[0]

        if (chip1Id && chip2Id && chip1Id !== chip2Id) {
          // Track which sides of each chip are strongly connected
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
    // If any strong connections exist anywhere in the problem, filter out all weak (pin-to-net) connections
    for (const [connKey, connected] of Object.entries(
      inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const [pinId, netId] = connKey.split("-")
      if (pinId && netId) {
        // Do not assign a network for weak connections when strong connections are present.
        // Mark this pin as filtered so callers can inspect what was ignored.
        filteredPins.add(pinId)
      }
    }
  } else {
    // No strong connections exist; include weak connections with basic opposite-side filtering
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

        // Check if this pin is on the opposite side of a chip we have strong connections to
        for (const [
          strongKey,
          strongSides,
        ] of strongConnectedChipSides.entries()) {
          const [fromChip, toChip] = strongKey.split("-")

          if (fromChip === chipId) {
            // This pin belongs to a chip that has strong connections
            // Check if any pins in this net belong to chips on the opposite side
            for (const [otherConnKey, otherConnected] of Object.entries(
              inputProblem.netConnMap,
            )) {
              if (!otherConnected) continue
              const [otherPinId, otherNetId] = otherConnKey.split("-")

              if (otherNetId === netId && otherPinId && otherPinId !== pinId) {
                const otherPin = inputProblem.chipPinMap[otherPinId]
                if (!otherPin) continue

                const otherChipId = otherPinId.split(".")[0]

                // If this net connects to a chip we have strong connections with
                if (otherChipId === toChip) {
                  // Check if the other pin is on a different side than our strong connections
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
          // Mark as opposite-strong-side-disconnected
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
      // If either pin already has a net connection, use that network for both
      const existingNet =
        pinToNetworkMap.get(pins[0]) || pinToNetworkMap.get(pins[1])
      if (existingNet) {
        pinToNetworkMap.set(pins[0], existingNet)
        pinToNetworkMap.set(pins[1], existingNet)
      } else {
        // Otherwise, use the connection itself as the network
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
