import { BaseSolver } from "../BaseSolver"
import type {
  InputProblem,
  ChipId,
  PinId,
  Chip,
} from "lib/types/InputProblem"

export interface PassiveGroup {
  passiveGroupId: string
  mainChipId: ChipId
  mainPinId: PinId
  passiveChipId: ChipId
}

/**
 * Identifies passive components (resistors, capacitors) that should be placed
 * near specific chip pins.
 */
export class IdentifyPassivesSolver extends BaseSolver {
  inputProblem: InputProblem
  outputPassiveGroups: PassiveGroup[] = []

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
  }

  override _step() {
    this.outputPassiveGroups = this.identifyPassives()
    this.solved = true
  }

  private identifyPassives(): PassiveGroup[] {
    const groups: PassiveGroup[] = []
    const handledPassives = new Set<ChipId>()

    const chips = Object.values(this.inputProblem.chipMap)
    
    // 1. Find all potential passives (2-pin components)
    const passives = chips.filter(c => c.pins.length === 2)

    for (const passive of passives) {
      if (handledPassives.has(passive.chipId)) continue

      // 2. Check if it's connected to a "main" chip (pin-to-pin strong connection)
      for (const pinId of passive.pins) {
        const strongNeighbors = this.getStronglyConnectedNeighborPins(pinId)
        
        for (const neighborPinId of strongNeighbors) {
          const neighborChipId = neighborPinId.split(".")[0]!
          const neighborChip = this.inputProblem.chipMap[neighborChipId]
          
          if (neighborChip && neighborChip.pins.length > 2) {
            // Found a passive connected to a main chip pin!
            groups.push({
              passiveGroupId: `passive_${passive.chipId}_${neighborPinId}`,
              mainChipId: neighborChipId,
              mainPinId: neighborPinId,
              passiveChipId: passive.chipId
            })
            handledPassives.add(passive.chipId)
            break
          }
        }
        if (handledPassives.has(passive.chipId)) break
      }
    }

    return groups
  }

  private getStronglyConnectedNeighborPins(pinId: PinId): Set<PinId> {
    const neighbors = new Set<PinId>()
    for (const [connKey, connected] of Object.entries(this.inputProblem.pinStrongConnMap)) {
      if (!connected) continue
      const [a, b] = connKey.split("-") as [PinId, PinId]
      if (a === pinId) {
        neighbors.add(b)
      } else if (b === pinId) {
        neighbors.add(a)
      }
    }
    return neighbors
  }
}
