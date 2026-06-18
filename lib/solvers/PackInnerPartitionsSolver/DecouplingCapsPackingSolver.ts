/**
 * Specialized solver that extends SingleInnerPartitionPackingSolver 
 * but applies custom horizontal layout for decoupling capacitors.
 */

import { SingleInnerPartitionPackingSolver } from "./SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem, ChipPin, PinId } from "../../types/InputProblem"

export class DecouplingCapsPackingSolver extends SingleInnerPartitionPackingSolver {
  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    pinIdToStronglyConnectedPins?: Record<PinId, ChipPin[]>
  }) {
    super(params)
  }

  override createLayoutFromPackingResult(
    packedComponents: any,
  ): any {
    // Custom layout: arrange caps in a clean horizontal row
    const chips = Object.entries(this.partitionInputProblem.chipMap)
    const chipPlacements: Record<string, any> = {}
    
    // Get gap setting
    const gap = this.partitionInputProblem.decouplingCapsGap ?? 0.05
    
    // Sort chips by size (largest first) for better stability
    const sortedChips = chips.sort((a, b) => {
      const sizeA = (a[1]?.size?.x ?? 0) * (a[1]?.size?.y ?? 0)
      const sizeB = (b[1]?.size?.x ?? 0) * (b[1]?.size?.y ?? 0)
      return sizeB - sizeA
    })
    
    // Position each chip in a horizontal row
    let currentX = 0
    for (const [chipId, chip] of sortedChips) {
      const size = chip?.size || { x: 0.1, y: 0.1 }
      
      chipPlacements[chipId] = {
        x: currentX,
        y: 0,
        ccwRotationDegrees: 0,
      }
      
      currentX += size.x + gap
    }
    
    return {
      chipPlacements,
      groupPlacements: {},
    }
  }
}
