/**
 * Specialized layout solver for decoupling capacitor partitions.
 * Arranges decoupling capacitors in a clean, organized pattern around the main chip.
 * 
 * This solver addresses issue #15 by:
 * 1. Arranging capacitors in a grid pattern for better organization
 * 2. Aligning capacitors consistently (all facing the same direction)
 * 3. Minimizing trace crossings and messy layouts
 * 4. Placing capacitors close to the main chip they're decoupling
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  InputProblem,
  PinId,
  ChipId,
  PartitionInputProblem,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

export class DecouplingCapsLayoutSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null

  constructor(params: { partitionInputProblem: PartitionInputProblem }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
  }

  override _step() {
    // Create specialized layout for decoupling capacitors
    this.layout = this.createDecouplingCapsLayout()
    this.solved = true
  }

  private createDecouplingCapsLayout(): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}
    const chips = Object.values(this.partitionInputProblem.chipMap)

    // Separate main chip from decoupling capacitors
    const mainChip = chips.find((chip) => chip.pins.length > 2)
    const decouplingCaps = chips.filter((chip) => chip.pins.length === 2)

    // Place main chip at center if it exists
    if (mainChip) {
      chipPlacements[mainChip.chipId] = {
        x: 0,
        y: 0,
        ccwRotationDegrees: 0,
      }
    }

    // Arrange decoupling capacitors in a clean grid pattern
    if (decouplingCaps.length > 0) {
      this.arrangeDecouplingCapsInGrid(
        decouplingCaps,
        chipPlacements,
        mainChip,
      )
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  private arrangeDecouplingCapsInGrid(
    decouplingCaps: any[],
    chipPlacements: Record<string, Placement>,
    mainChip: any | undefined,
  ) {
    const gap = this.partitionInputProblem.decouplingCapsGap ?? 0.5
    const capsPerRow = Math.ceil(Math.sqrt(decouplingCaps.length))

    // Calculate starting position based on main chip size
    const mainChipWidth = mainChip?.size.x ?? 2
    const mainChipHeight = mainChip?.size.y ?? 2
    const startX = mainChipWidth / 2 + gap * 2
    const startY = -((capsPerRow - 1) * gap) / 2

    // Arrange capacitors in a grid to the right of the main chip
    for (let i = 0; i < decouplingCaps.length; i++) {
      const cap = decouplingCaps[i]!
      const row = Math.floor(i / capsPerRow)
      const col = i % capsPerRow

      // Calculate position in grid
      const x = startX + col * (cap.size.x + gap)
      const y = startY + row * (cap.size.y + gap)

      // Determine rotation based on pin configuration
      // All capacitors should face the same direction for consistency
      const rotation = this.getOptimalCapacitorRotation(cap)

      chipPlacements[cap.chipId] = {
        x,
        y,
        ccwRotationDegrees: rotation,
      }
    }
  }

  private getOptimalCapacitorRotation(cap: any): number {
    // Check available rotations
    const availableRotations = cap.availableRotations || [0, 180]

    // For decoupling capacitors, we want them oriented consistently
    // Prefer 0 or 180 degrees (horizontal orientation)
    if (availableRotations.includes(0)) {
      return 0
    }
    if (availableRotations.includes(180)) {
      return 180
    }

    // Fallback to first available rotation
    return availableRotations[0] || 0
  }

  override visualize(): GraphicsObject {
    if (!this.layout) {
      const basicLayout = doBasicInputProblemLayout(this.partitionInputProblem)
      return visualizeInputProblem(this.partitionInputProblem, basicLayout)
    }

    return visualizeInputProblem(this.partitionInputProblem, this.layout)
  }

  override getConstructorParams(): [InputProblem] {
    return [this.partitionInputProblem]
  }
}
