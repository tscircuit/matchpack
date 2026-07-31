import type { Chip, InputProblem, PinId } from "../types/InputProblem"

/**
 * Builds a reusable PinId → Chip index to avoid repeated chipMap scans.
 * Construction is O(pins) time and space; later lookups average O(1).
 */
export const createPinOwnerMap = (
  inputProblem: InputProblem,
): Map<PinId, Chip> => {
  const pinOwnerMap = new Map<PinId, Chip>()
  for (const chip of Object.values(inputProblem.chipMap)) {
    for (const pinId of chip.pins) {
      pinOwnerMap.set(pinId, chip)
    }
  }
  return pinOwnerMap
}
