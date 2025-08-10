/**
 * Finds overlaps between laid out boxes from each pin range and fixes them.
 * Resolves spatial conflicts between different pin range layouts.
 */

import type { GraphicsObject } from "graphics-debug"
import { stackGraphicsHorizontally } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { PinRange } from "../PinRangeMatchSolver/PartitionPinRangeMatchSolver/PartitionPinRangeMatchSolver"
import type { InputProblem } from "../../types/InputProblem"
import { PinRangeLayoutSolver } from "../PinRangeLayoutSolver/PinRangeLayoutSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

type ComponentBounds = {
  chipId: string
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  placement: Placement
}

export class PinRangeOverlapSolver extends BaseSolver {
  pinRangeLayoutSolver: PinRangeLayoutSolver | null = null
  inputProblems: InputProblem[]
  resolvedLayout: OutputLayout | null = null

  constructor(
    pinRangeLayoutSolver: PinRangeLayoutSolver,
    inputProblems: InputProblem[],
  ) {
    super()
    this.pinRangeLayoutSolver = pinRangeLayoutSolver
    this.inputProblems = inputProblems
  }

  override _step() {
    try {
      if (!this.pinRangeLayoutSolver?.solved) {
        this.failed = true
        this.error = "PinRangeLayoutSolver not solved"
        return
      }

      // Group placements by partition (InputProblem)
      const partitionLayouts = this.groupPlacementsByPartition()

      // Resolve overlaps within each partition independently
      const resolvedPartitionLayouts = partitionLayouts.map((partitionLayout) =>
        this.resolvePartitionOverlaps(partitionLayout),
      )

      // Position partitions horizontally separated
      const finalLayout = this.positionPartitionsHorizontally(
        resolvedPartitionLayouts,
      )

      this.resolvedLayout = finalLayout
      this.solved = true
    } catch (error) {
      this.failed = true
      this.error = `Failed to resolve pin range overlaps: ${error}`
    }
  }

  private groupPlacementsByPartition(): Array<{
    partitionIndex: number
    inputProblem: InputProblem
    chipPlacements: Record<string, Placement>
    groupPlacements: Record<string, Placement>
  }> {
    const partitionLayouts: Array<{
      partitionIndex: number
      inputProblem: InputProblem
      chipPlacements: Record<string, Placement>
      groupPlacements: Record<string, Placement>
    }> = []

    // Initialize partition layouts
    for (let i = 0; i < this.inputProblems.length; i++) {
      partitionLayouts.push({
        partitionIndex: i,
        inputProblem: this.inputProblems[i]!,
        chipPlacements: {},
        groupPlacements: {},
      })
    }

    // Collect placements from completed solvers and group by partition
    for (const singleSolver of this.pinRangeLayoutSolver!.completedSolvers) {
      if (singleSolver.layout) {
        // Find which partition this solver belongs to based on its input problem
        const partitionIndex = this.findPartitionIndexForSolver(singleSolver)
        if (partitionIndex >= 0) {
          Object.assign(
            partitionLayouts[partitionIndex]!.chipPlacements,
            singleSolver.layout.chipPlacements,
          )
          Object.assign(
            partitionLayouts[partitionIndex]!.groupPlacements,
            singleSolver.layout.groupPlacements,
          )
        }
      }
    }

    // Include active solver if it has a layout
    if (this.pinRangeLayoutSolver!.activeSolver?.layout) {
      const partitionIndex = this.findPartitionIndexForSolver(
        this.pinRangeLayoutSolver!.activeSolver,
      )
      if (partitionIndex >= 0) {
        Object.assign(
          partitionLayouts[partitionIndex]!.chipPlacements,
          this.pinRangeLayoutSolver!.activeSolver.layout.chipPlacements,
        )
        Object.assign(
          partitionLayouts[partitionIndex]!.groupPlacements,
          this.pinRangeLayoutSolver!.activeSolver.layout.groupPlacements,
        )
      }
    }

    return partitionLayouts
  }

  private findPartitionIndexForSolver(singleSolver: any): number {
    // Find which input problem contains the chips/groups from this solver's layout
    if (!singleSolver.layout) return -1

    const layoutChipIds = Object.keys(singleSolver.layout.chipPlacements)
    const layoutGroupIds = Object.keys(singleSolver.layout.groupPlacements)

    for (let i = 0; i < this.inputProblems.length; i++) {
      const inputProblem = this.inputProblems[i]!

      // Check if this partition contains any of the chips/groups from the layout
      const hasAnyChip = layoutChipIds.some(
        (chipId) => inputProblem.chipMap[chipId],
      )
      const hasAnyGroup = layoutGroupIds.some(
        (groupId) => inputProblem.groupMap[groupId],
      )

      if (hasAnyChip || hasAnyGroup) {
        return i
      }
    }

    return -1
  }

  private resolvePartitionOverlaps(partitionLayout: {
    partitionIndex: number
    inputProblem: InputProblem
    chipPlacements: Record<string, Placement>
    groupPlacements: Record<string, Placement>
  }): {
    partitionIndex: number
    inputProblem: InputProblem
    chipPlacements: Record<string, Placement>
    groupPlacements: Record<string, Placement>
  } {
    // Create a copy to avoid modifying the original
    const resolvedLayout = {
      ...partitionLayout,
      chipPlacements: { ...partitionLayout.chipPlacements },
      groupPlacements: { ...partitionLayout.groupPlacements },
    }

    // Find overlaps within this partition only
    const overlaps = this.findOverlaps(resolvedLayout.chipPlacements)

    if (overlaps.length > 0) {
      // Resolve overlaps by shifting components
      this.resolveOverlaps(resolvedLayout.chipPlacements, overlaps)
    }

    return resolvedLayout
  }

  private positionPartitionsHorizontally(
    partitionLayouts: Array<{
      partitionIndex: number
      inputProblem: InputProblem
      chipPlacements: Record<string, Placement>
      groupPlacements: Record<string, Placement>
    }>,
  ): OutputLayout {
    const finalChipPlacements: Record<string, Placement> = {}
    const finalGroupPlacements: Record<string, Placement> = {}

    let currentOffsetX = 0
    const partitionGap = 5 // Gap between partitions

    for (const partitionLayout of partitionLayouts) {
      // Calculate partition bounds
      const chipIds = Object.keys(partitionLayout.chipPlacements)
      if (chipIds.length === 0) continue

      const xs = chipIds.map(
        (chipId) => partitionLayout.chipPlacements[chipId]!.x,
      )
      const partitionMinX = Math.min(...xs)
      const partitionMaxX = Math.max(...xs)
      const partitionWidth = partitionMaxX - partitionMinX

      // Calculate offset to position this partition
      const offsetX = currentOffsetX - partitionMinX

      // Apply offset to all components in this partition
      for (const [chipId, placement] of Object.entries(
        partitionLayout.chipPlacements,
      )) {
        finalChipPlacements[chipId] = {
          x: placement.x + offsetX,
          y: placement.y,
          ccwRotationDegrees: placement.ccwRotationDegrees,
        }
      }

      for (const [groupId, placement] of Object.entries(
        partitionLayout.groupPlacements,
      )) {
        finalGroupPlacements[groupId] = {
          x: placement.x + offsetX,
          y: placement.y,
          ccwRotationDegrees: placement.ccwRotationDegrees,
        }
      }

      // Update offset for next partition
      currentOffsetX += partitionWidth + partitionGap
    }

    return {
      chipPlacements: finalChipPlacements,
      groupPlacements: finalGroupPlacements,
    }
  }

  private findOverlaps(chipPlacements: Record<string, Placement>): Array<{
    chip1: string
    chip2: string
    bounds1: ComponentBounds["bounds"]
    bounds2: ComponentBounds["bounds"]
  }> {
    const components = this.getComponentBounds(chipPlacements)
    const overlaps: Array<{
      chip1: string
      chip2: string
      bounds1: ComponentBounds["bounds"]
      bounds2: ComponentBounds["bounds"]
    }> = []

    // Check each pair of components for overlap
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const comp1 = components[i]!
        const comp2 = components[j]!

        if (this.boundsOverlap(comp1.bounds, comp2.bounds)) {
          overlaps.push({
            chip1: comp1.chipId,
            chip2: comp2.chipId,
            bounds1: comp1.bounds,
            bounds2: comp2.bounds,
          })
        }
      }
    }

    return overlaps
  }

  private getComponentBounds(
    chipPlacements: Record<string, Placement>,
  ): ComponentBounds[] {
    const components: ComponentBounds[] = []

    for (const [chipId, placement] of Object.entries(chipPlacements)) {
      // Find chip size from input problems
      let chipSize = { x: 1, y: 1 } // Default size
      for (const inputProblem of this.inputProblems) {
        const chip = inputProblem.chipMap[chipId]
        if (chip) {
          chipSize = chip.size
          break
        }
      }

      // Calculate bounds considering rotation
      const halfWidth = chipSize.x / 2
      const halfHeight = chipSize.y / 2

      // For simplicity, use axis-aligned bounding box (could be improved with rotated bounds)
      const bounds = {
        minX: placement.x - halfWidth,
        maxX: placement.x + halfWidth,
        minY: placement.y - halfHeight,
        maxY: placement.y + halfHeight,
      }

      components.push({
        chipId,
        bounds,
        placement,
      })
    }

    return components
  }

  private boundsOverlap(
    bounds1: ComponentBounds["bounds"],
    bounds2: ComponentBounds["bounds"],
  ): boolean {
    return !(
      bounds1.maxX <= bounds2.minX ||
      bounds1.minX >= bounds2.maxX ||
      bounds1.maxY <= bounds2.minY ||
      bounds1.minY >= bounds2.maxY
    )
  }

  private resolveOverlaps(
    chipPlacements: Record<string, Placement>,
    overlaps: Array<{
      chip1: string
      chip2: string
      bounds1: ComponentBounds["bounds"]
      bounds2: ComponentBounds["bounds"]
    }>,
  ) {
    // Simple overlap resolution: push components apart along the axis with least overlap
    for (const overlap of overlaps) {
      const { chip1, chip2, bounds1, bounds2 } = overlap

      // Calculate overlap distances
      const overlapX = Math.min(
        bounds1.maxX - bounds2.minX,
        bounds2.maxX - bounds1.minX,
      )
      const overlapY = Math.min(
        bounds1.maxY - bounds2.minY,
        bounds2.maxY - bounds1.minY,
      )

      const placement1 = chipPlacements[chip1]!
      const placement2 = chipPlacements[chip2]!

      // Resolve along the axis with smaller overlap to minimize movement
      if (overlapX < overlapY) {
        // Resolve horizontally
        const separation = overlapX / 2 + 0.1 // Add small buffer
        if (placement1.x < placement2.x) {
          placement1.x -= separation
          placement2.x += separation
        } else {
          placement1.x += separation
          placement2.x -= separation
        }
      } else {
        // Resolve vertically
        const separation = overlapY / 2 + 0.1 // Add small buffer
        if (placement1.y < placement2.y) {
          placement1.y -= separation
          placement2.y += separation
        } else {
          placement1.y += separation
          placement2.y -= separation
        }
      }
    }
  }

  override visualize(): GraphicsObject {
    if (!this.resolvedLayout) {
      return super.visualize()
    }

    // Group placements by partition to visualize each separately
    const partitionLayouts = this.groupPlacementsByPartition()
    const partitionVisualizations: GraphicsObject[] = []

    for (const partitionLayout of partitionLayouts) {
      if (Object.keys(partitionLayout.chipPlacements).length === 0) continue

      // Create layout just for this partition with resolved positions
      const partitionOutputLayout: OutputLayout = {
        chipPlacements: {},
        groupPlacements: {},
      }

      // Get resolved positions for this partition's components
      for (const chipId of Object.keys(partitionLayout.chipPlacements)) {
        if (this.resolvedLayout.chipPlacements[chipId]) {
          partitionOutputLayout.chipPlacements[chipId] =
            this.resolvedLayout.chipPlacements[chipId]!
        }
      }

      for (const groupId of Object.keys(partitionLayout.groupPlacements)) {
        if (this.resolvedLayout.groupPlacements[groupId]) {
          partitionOutputLayout.groupPlacements[groupId] =
            this.resolvedLayout.groupPlacements[groupId]!
        }
      }

      const viz = visualizeInputProblem(
        partitionLayout.inputProblem,
        partitionOutputLayout,
      )
      partitionVisualizations.push({
        ...viz,
        title: `Partition ${partitionLayout.partitionIndex + 1}`,
      })
    }

    if (partitionVisualizations.length === 0) {
      return super.visualize()
    }

    if (partitionVisualizations.length === 1) {
      return partitionVisualizations[0]!
    }

    return stackGraphicsHorizontally(partitionVisualizations)
  }

  override getConstructorParams() {
    return {
      pinRangeLayoutSolver: this.pinRangeLayoutSolver,
      inputProblems: this.inputProblems,
    }
  }
}
