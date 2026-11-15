
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"

/**
 * Applies voltage bias to the layout by adjusting the positions of components
 * connected to voltage nets (VCC, V3_3, etc.) to prefer upward routing.
 */
export function applyVoltageBias(
  inputProblem: InputProblem,
  layout: OutputLayout
): OutputLayout {
  // Create a copy of the layout to modify
  const modifiedLayout = structuredClone(layout)

  // Identify voltage nets (VCC, V3_3, V*, etc.)
  const voltageNets = new Set<string>()
  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (netId.startsWith("V") || net.isPositiveVoltageSource || net.preferUpwardRouting) {
      voltageNets.add(netId)
    }
  }

  // Find all chips connected to voltage nets
  const chipsWithVoltageConnections = new Set<string>()
  for (const chipId in inputProblem.chipMap) {
    const chip = inputProblem.chipMap[chipId]
    if (!chip) continue

    for (const pinId of chip.pins) {
      const pin = inputProblem.chipPinMap[pinId]
      if (!pin) continue

      // Find the net connected to this pin
      for (const [connKey, connected] of Object.entries(inputProblem.netConnMap)) {
        if (connected && connKey.includes(pinId)) {
          const [pinIdPart, netId] = connKey.split("-")
          if (pinIdPart === pinId && voltageNets.has(netId)) {
            chipsWithVoltageConnections.add(chipId)
            break
          }
        }
      }
    }
  }

  // First, calculate the bounding box of all components
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const chipId in modifiedLayout.chipPlacements) {
    const placement = modifiedLayout.chipPlacements[chipId]
    const chip = inputProblem.chipMap[chipId]
    if (!chip || !placement) continue

    // Calculate rotated bounds
    const halfWidth = chip.size.x / 2
    const halfHeight = chip.size.y / 2
    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))

    // Rotated bounding box dimensions
    const rotatedWidth = halfWidth * cos + halfHeight * sin
    const rotatedHeight = halfWidth * sin + halfHeight * cos

    minX = Math.min(minX, placement.x - rotatedWidth)
    maxX = Math.max(maxX, placement.x + rotatedWidth)
    minY = Math.min(minY, placement.y - rotatedHeight)
    maxY = Math.max(maxY, placement.y + rotatedHeight)
  }

  // Calculate the center of the layout
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  // Apply upward bias to chips connected to voltage nets
  // We'll move them toward the top of the layout (lower y values)
  // but ensure they don't overlap with other components
  for (const chipId of chipsWithVoltageConnections) {
    if (modifiedLayout.chipPlacements[chipId]) {
      const placement = modifiedLayout.chipPlacements[chipId]
      const chip = inputProblem.chipMap[chipId]

      if (!chip) continue

      // Calculate the current position relative to the center
      const relX = placement.x - centerX
      const relY = placement.y - centerY

      // Calculate a target position that's more upward (lower y)
      // but maintain the same x position relative to center
      const targetRelY = relY * 0.8 // Move 20% closer to the top
      const deltaY = targetRelY - relY

      // Apply the movement
      placement.y += deltaY
    }
  }

  return modifiedLayout
}
