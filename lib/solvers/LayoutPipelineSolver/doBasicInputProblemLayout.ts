import { pack } from "calculate-packing"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"

export function doBasicInputProblemLayout(
  inputProblem: InputProblem,
): OutputLayout {
  // Convert InputProblem to calculate-packing format
  const components = Object.entries(inputProblem.chipMap).map(
    ([chipId, chip]) => {
      const chipPins = chip.pins.map((pinId) => inputProblem.chipPinMap[pinId]!)

      // Note: We don't need to calculate bounding box - the pack algorithm calculates from pads

      // Convert pins to pads with network information
      const pads = chipPins.map((pin) => {
        // Find which network this pin connects to using strong connections
        let networkId = pin.pinId // Default to unique network per pin

        // Look for strong connections to this pin
        for (const [connKey, connected] of Object.entries(
          inputProblem.pinStrongConnMap,
        )) {
          if (connected && connKey.includes(pin.pinId)) {
            const [pin1Id, pin2Id] = connKey.split("-")
            if (pin1Id === pin.pinId || pin2Id === pin.pinId) {
              // Create connectivity key from sorted pin IDs
              networkId = [pin1Id, pin2Id].sort().join("_")
              break
            }
          }
        }

        return {
          padId: pin.pinId,
          networkId,
          type: "rect" as const,
          offset: pin.offset,
          size: { x: 0.001, y: 0.001 }, // Small pad size
        }
      })

      // Create inner body pad
      pads.push({
        padId: `${chipId}-body`,
        networkId: chipId,
        type: "rect" as const,
        offset: { x: 0, y: 0 },
        size: { x: chip.size.x, y: chip.size.y },
      })

      return {
        componentId: chipId,
        pads,
      }
    },
  )

  // Pack with specified gap
  const packResult = pack({
    components,
    minGap: 0.4,
    packOrderStrategy: "largest_to_smallest",
    packPlacementStrategy: "shortest_connection_along_outline",
  })

  // Convert pack result to OutputLayout
  const chipPlacements: Record<
    string,
    { x: number; y: number; ccwRotationDegrees: number }
  > = {}

  for (const component of packResult.components) {
    chipPlacements[component.componentId] = {
      x: component.center.x,
      y: component.center.y,
      ccwRotationDegrees: component.ccwRotationOffset,
    }
  }

  return {
    chipPlacements,
    groupPlacements: {}, // No groups for now
  }
}
