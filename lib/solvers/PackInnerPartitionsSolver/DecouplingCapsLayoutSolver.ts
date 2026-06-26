/**
 * Specialized layout solver for decoupling capacitor partitions.
 * Arranges decoupling capacitors in a clean, organized pattern around the main chip.
 * 
 * This solver addresses issue #15 by:
 * 1. Arranging capacitors in a compact grid pattern for better organization
 * 2. Aligning capacitors consistently (all facing the same direction)
 * 3. Minimizing trace crossings and messy layouts
 * 4. Placing capacitors close to the main chip they're decoupling
 * 5. Supporting multiple layout strategies (grid, circular, linear)
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  InputProblem,
  PinId,
  ChipId,
  PartitionInputProblem,
  Chip,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

type LayoutStrategy = "grid" | "linear" | "circular"

export class DecouplingCapsLayoutSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  layoutStrategy: LayoutStrategy = "grid"

  constructor(params: { 
    partitionInputProblem: PartitionInputProblem
    layoutStrategy?: LayoutStrategy 
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.layoutStrategy = params.layoutStrategy || "grid"
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

    // Arrange decoupling capacitors based on strategy
    if (decouplingCaps.length > 0) {
      switch (this.layoutStrategy) {
        case "grid":
          this.arrangeDecouplingCapsInGrid(
            decouplingCaps,
            chipPlacements,
            mainChip,
          )
          break
        case "linear":
          this.arrangeDecouplingCapsLinear(
            decouplingCaps,
            chipPlacements,
            mainChip,
          )
          break
        case "circular":
          this.arrangeDecouplingCapsCircular(
            decouplingCaps,
            chipPlacements,
            mainChip,
          )
          break
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  /**
   * Arranges capacitors in a compact grid pattern
   * Best for: 4+ capacitors
   */
  private arrangeDecouplingCapsInGrid(
    decouplingCaps: Chip[],
    chipPlacements: Record<string, Placement>,
    mainChip: Chip | undefined,
  ) {
    const gap = this.partitionInputProblem.decouplingCapsGap ?? 0.3
    
    // Calculate optimal grid dimensions (prefer square-ish layouts)
    const numCaps = decouplingCaps.length
    const cols = Math.ceil(Math.sqrt(numCaps))
    const rows = Math.ceil(numCaps / cols)

    // Calculate starting position based on main chip size
    const mainChipWidth = mainChip?.size.x ?? 2
    const mainChipHeight = mainChip?.size.y ?? 2
    
    // Get average capacitor size
    const avgCapWidth = decouplingCaps.reduce((sum, cap) => sum + cap.size.x, 0) / numCaps
    const avgCapHeight = decouplingCaps.reduce((sum, cap) => sum + cap.size.y, 0) / numCaps
    
    // Calculate grid dimensions
    const gridWidth = cols * avgCapWidth + (cols - 1) * gap
    const gridHeight = rows * avgCapHeight + (rows - 1) * gap
    
    // Position grid to the right of main chip
    const startX = mainChipWidth / 2 + gap * 2
    const startY = -gridHeight / 2

    // Arrange capacitors in grid
    for (let i = 0; i < decouplingCaps.length; i++) {
      const cap = decouplingCaps[i]!
      const row = Math.floor(i / cols)
      const col = i % cols

      const x = startX + col * (avgCapWidth + gap) + avgCapWidth / 2
      const y = startY + row * (avgCapHeight + gap) + avgCapHeight / 2

      const rotation = this.getOptimalCapacitorRotation(cap)

      chipPlacements[cap.chipId] = {
        x,
        y,
        ccwRotationDegrees: rotation,
      }
    }
  }

  /**
   * Arranges capacitors in a single line
   * Best for: 2-3 capacitors
   */
  private arrangeDecouplingCapsLinear(
    decouplingCaps: Chip[],
    chipPlacements: Record<string, Placement>,
    mainChip: Chip | undefined,
  ) {
    const gap = this.partitionInputProblem.decouplingCapsGap ?? 0.3
    const mainChipWidth = mainChip?.size.x ?? 2
    
    const avgCapHeight = decouplingCaps.reduce((sum, cap) => sum + cap.size.y, 0) / decouplingCaps.length
    const totalHeight = decouplingCaps.length * avgCapHeight + (decouplingCaps.length - 1) * gap
    
    const startX = mainChipWidth / 2 + gap * 2
    const startY = -totalHeight / 2

    for (let i = 0; i < decouplingCaps.length; i++) {
      const cap = decouplingCaps[i]!
      const y = startY + i * (avgCapHeight + gap) + avgCapHeight / 2

      const rotation = this.getOptimalCapacitorRotation(cap)

      chipPlacements[cap.chipId] = {
        x: startX,
        y,
        ccwRotationDegrees: rotation,
      }
    }
  }

  /**
   * Arranges capacitors in a circular pattern around the main chip
   * Best for: 4-8 capacitors, provides symmetrical layout
   */
  private arrangeDecouplingCapsCircular(
    decouplingCaps: Chip[],
    chipPlacements: Record<string, Placement>,
    mainChip: Chip | undefined,
  ) {
    const mainChipWidth = mainChip?.size.x ?? 2
    const mainChipHeight = mainChip?.size.y ?? 2
    const gap = this.partitionInputProblem.decouplingCapsGap ?? 0.5
    
    // Calculate radius based on main chip size
    const radius = Math.max(mainChipWidth, mainChipHeight) / 2 + gap * 2
    
    const angleStep = (2 * Math.PI) / decouplingCaps.length

    for (let i = 0; i < decouplingCaps.length; i++) {
      const cap = decouplingCaps[i]!
      const angle = i * angleStep
      
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)

      // Rotate capacitor to face the center
      const rotationToCenter = (angle * 180 / Math.PI + 90) % 360
      const rotation = this.getClosestAvailableRotation(cap, rotationToCenter)

      chipPlacements[cap.chipId] = {
        x,
        y,
        ccwRotationDegrees: rotation,
      }
    }
  }

  private getOptimalCapacitorRotation(cap: Chip): number {
    const availableRotations = cap.availableRotations || [0, 180]

    // For grid/linear layouts, prefer horizontal orientation (0 or 180)
    if (availableRotations.includes(0)) {
      return 0
    }
    if (availableRotations.includes(180)) {
      return 180
    }

    return availableRotations[0] || 0
  }

  private getClosestAvailableRotation(cap: Chip, targetRotation: number): number {
    const availableRotations = cap.availableRotations || [0, 180]
    
    // Find the closest available rotation to the target
    let closest = availableRotations[0] || 0
    let minDiff = Math.abs(targetRotation - closest)

    for (const rotation of availableRotations) {
      const diff = Math.abs(targetRotation - rotation)
      if (diff < minDiff) {
        minDiff = diff
        closest = rotation
      }
    }

    return closest
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
