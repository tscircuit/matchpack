/**
 * Packs the laid out chip partitions into a single layout.
 * Combines all the individually processed partitions into the final schematic layout.
 */

import type { GraphicsObject } from "graphics-debug"
import { type PackInput, PhasedPackSolver } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { InputProblem } from "../../types/InputProblem"
import { PinRangeOverlapSolver } from "../PinRangeOverlapSolver/PinRangeOverlapSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export class PartitionPackingSolver extends BaseSolver {
  pinRangeOverlapSolver: PinRangeOverlapSolver | null = null
  inputProblems: InputProblem[]
  finalLayout: OutputLayout | null = null
  phasedPackSolver: PhasedPackSolver | null = null

  constructor(
    pinRangeOverlapSolver: PinRangeOverlapSolver,
    inputProblems: InputProblem[],
  ) {
    super()
    this.pinRangeOverlapSolver = pinRangeOverlapSolver
    this.inputProblems = inputProblems
  }

  override _step() {
    try {
      if (
        !this.pinRangeOverlapSolver?.solved ||
        !this.pinRangeOverlapSolver.resolvedLayout
      ) {
        this.failed = true
        this.error = "PinRangeOverlapSolver not solved or no resolved layout"
        return
      }

      // Get the overlap-resolved layout
      const resolvedLayout = this.pinRangeOverlapSolver.resolvedLayout

      // Create groups of components by partition for better organization
      const partitionGroups = this.organizeComponentsByPartition(resolvedLayout)

      if (partitionGroups.length === 0) {
        this.finalLayout = resolvedLayout
        this.solved = true
        return
      }

      // Initialize PhasedPackSolver if not already created
      if (!this.phasedPackSolver) {
        const packInput = this.createPackInput(partitionGroups)
        this.phasedPackSolver = new PhasedPackSolver(packInput)
        this.activeSubSolver = this.phasedPackSolver
      }

      // Run one step of the PhasedPackSolver
      this.phasedPackSolver.step()

      if (this.phasedPackSolver.failed) {
        this.failed = true
        this.error = `PhasedPackSolver failed: ${this.phasedPackSolver.error}`
        return
      }

      if (this.phasedPackSolver.solved) {
        // Apply the packing result to the layout
        const packedLayout = this.applyPackingResult(
          this.phasedPackSolver.getResult(),
          partitionGroups,
          resolvedLayout,
        )
        this.finalLayout = packedLayout
        this.solved = true
        this.activeSubSolver = null
      }
    } catch (error) {
      this.failed = true
      this.error = `Failed to pack partitions: ${error}`
    }
  }

  private organizeComponentsByPartition(layout: OutputLayout): Array<{
    partitionIndex: number
    chipIds: string[]
    bounds: {
      minX: number
      maxX: number
      minY: number
      maxY: number
    }
  }> {
    // Group chips by partition based on which input problem they belong to
    const partitionGroups: Array<{
      partitionIndex: number
      chipIds: string[]
      bounds: {
        minX: number
        maxX: number
        minY: number
        maxY: number
      }
    }> = []

    for (let i = 0; i < this.inputProblems.length; i++) {
      const inputProblem = this.inputProblems[i]!
      const partitionChipIds: string[] = []

      // Find chips from this partition that are in the layout
      for (const chipId of Object.keys(inputProblem.chipMap)) {
        if (layout.chipPlacements[chipId]) {
          partitionChipIds.push(chipId)
        }
      }

      if (partitionChipIds.length > 0) {
        // Calculate bounding box for this partition
        const xs = partitionChipIds.map(
          (chipId) => layout.chipPlacements[chipId]!.x,
        )
        const ys = partitionChipIds.map(
          (chipId) => layout.chipPlacements[chipId]!.y,
        )

        const bounds = {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
        }

        partitionGroups.push({
          partitionIndex: i,
          chipIds: partitionChipIds,
          bounds,
        })
      }
    }

    return partitionGroups
  }

  private createPackInput(
    partitionGroups: Array<{
      partitionIndex: number
      chipIds: string[]
      bounds: {
        minX: number
        maxX: number
        minY: number
        maxY: number
      }
    }>,
  ): PackInput {
    // Create pack components for each partition group
    const packComponents = partitionGroups.map((group, index) => {
      const width = group.bounds.maxX - group.bounds.minX + 2 // Add padding
      const height = group.bounds.maxY - group.bounds.minY + 2 // Add padding

      return {
        componentId: `partition_${group.partitionIndex}`,
        pads: [
          {
            padId: `partition_${group.partitionIndex}_body`,
            networkId: `partition_${group.partitionIndex}_disconnected`,
            type: "rect" as const,
            offset: { x: 0, y: 0 },
            size: { x: width, y: height },
          },
        ],
      }
    })

    return {
      components: packComponents,
      minGap: 2, // Generous gap between partitions
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_sum_squared_distance_to_network",
    }
  }

  private applyPackingResult(
    packedComponents: any[],
    partitionGroups: Array<{
      partitionIndex: number
      chipIds: string[]
      bounds: {
        minX: number
        maxX: number
        minY: number
        maxY: number
      }
    }>,
    currentLayout: OutputLayout,
  ): OutputLayout {
    // Apply the partition offsets to individual components
    const newChipPlacements: Record<string, Placement> = {}

    for (const packedComponent of packedComponents) {
      const partitionIndex = parseInt(
        packedComponent.componentId.replace("partition_", ""),
      )
      const group = partitionGroups.find(
        (g) => g.partitionIndex === partitionIndex,
      )

      if (group) {
        // Calculate offset to apply to this partition's components
        const currentCenterX = (group.bounds.minX + group.bounds.maxX) / 2
        const currentCenterY = (group.bounds.minY + group.bounds.maxY) / 2
        const newCenterX = packedComponent.center.x
        const newCenterY = packedComponent.center.y

        const offsetX = newCenterX - currentCenterX
        const offsetY = newCenterY - currentCenterY

        // Apply offset to all chips in this partition
        for (const chipId of group.chipIds) {
          const originalPlacement = currentLayout.chipPlacements[chipId]!
          newChipPlacements[chipId] = {
            x: originalPlacement.x + offsetX,
            y: originalPlacement.y + offsetY,
            ccwRotationDegrees: originalPlacement.ccwRotationDegrees,
          }
        }
      }
    }

    return {
      chipPlacements: newChipPlacements,
      groupPlacements: { ...currentLayout.groupPlacements }, // Copy group placements unchanged
    }
  }

  override visualize(): GraphicsObject {
    if (this.phasedPackSolver && !this.solved) {
      return this.phasedPackSolver.visualize()
    }

    if (!this.finalLayout) {
      return super.visualize()
    }

    // Create a combined input problem for visualization
    const combinedProblem: InputProblem = {
      chipMap: {},
      groupMap: {},
      chipPinMap: {},
      groupPinMap: {},
      pinStrongConnMap: {},
      netMap: {},
      netConnMap: {},
    }

    // Combine all input problems
    for (const inputProblem of this.inputProblems) {
      Object.assign(combinedProblem.chipMap, inputProblem.chipMap)
      Object.assign(combinedProblem.groupMap, inputProblem.groupMap)
      Object.assign(combinedProblem.chipPinMap, inputProblem.chipPinMap)
      Object.assign(combinedProblem.groupPinMap, inputProblem.groupPinMap)
      Object.assign(
        combinedProblem.pinStrongConnMap,
        inputProblem.pinStrongConnMap,
      )
      Object.assign(combinedProblem.netMap, inputProblem.netMap)
      Object.assign(combinedProblem.netConnMap, inputProblem.netConnMap)
    }

    return visualizeInputProblem(combinedProblem, this.finalLayout)
  }

  override getConstructorParams() {
    return {
      pinRangeOverlapSolver: this.pinRangeOverlapSolver,
      inputProblems: this.inputProblems,
    }
  }
}
