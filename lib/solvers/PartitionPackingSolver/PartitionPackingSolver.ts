/**
 * Packs the laid out chip partitions into a single layout.
 * Combines all the individually processed partitions into the final schematic layout.
 */

import type { GraphicsObject } from "graphics-debug"
import { type PackInput, PhasedPackSolver } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { InputProblem } from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export interface PartitionPackingSolverInput {
  resolvedLayout: OutputLayout
  inputProblems: InputProblem[]
}

export class PartitionPackingSolver extends BaseSolver {
  resolvedLayout: OutputLayout
  inputProblems: InputProblem[]
  finalLayout: OutputLayout | null = null
  phasedPackSolver: PhasedPackSolver | null = null

  constructor(input: PartitionPackingSolverInput) {
    super()
    this.resolvedLayout = input.resolvedLayout
    this.inputProblems = input.inputProblems
  }

  override _step() {
    try {
      if (!this.resolvedLayout) {
        this.failed = true
        this.error = "No resolved layout provided"
        return
      }

      // Get the overlap-resolved layout
      const resolvedLayout = this.resolvedLayout

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
    // Get the resolved layout to access chip placements
    const resolvedLayout = this.resolvedLayout
    
    // Create pack components for each partition group
    const packComponents = partitionGroups.map((group) => {
      // Create pads for all pins of all chips in this partition
      const pads: Array<{
        padId: string
        networkId: string
        type: "rect"
        offset: { x: number; y: number }
        size: { x: number; y: number }
      }> = []
      
      for (const chipId of group.chipIds) {
        const chipPlacement = resolvedLayout.chipPlacements[chipId]!
        const chip = this.inputProblems[group.partitionIndex]!.chipMap[chipId]!
        const chipPinMap = this.inputProblems[group.partitionIndex]!.chipPinMap
        
        // Calculate relative chip position from partition bounds
        const relativeChipX = chipPlacement.x - group.bounds.minX
        const relativeChipY = chipPlacement.y - group.bounds.minY
        
        // Add chip body pad (disconnected from any network)
        pads.push({
          padId: `${chipId}_body`,
          networkId: `${chipId}_body_disconnected`,
          type: "rect" as const,
          offset: { x: relativeChipX, y: relativeChipY },
          size: { x: chip.size.x, y: chip.size.y },
        })
        
        // Create a pad for each pin on this chip
        for (const pinId of chip.pins) {
          const pin = chipPinMap[pinId]
          if (!pin) continue
          
          // Calculate pin position relative to partition bounds
          const pinX = relativeChipX + pin.offset.x
          const pinY = relativeChipY + pin.offset.y
          
          // Find network for this pin by checking strong connections
          let networkId = pinId // default to pin ID
          const pinStrongConnMap = this.inputProblems[group.partitionIndex]!.pinStrongConnMap
          
          // Look for strong connections involving this pin
          for (const [connKey, connected] of Object.entries(pinStrongConnMap)) {
            if (connected && connKey.includes(pinId)) {
              // Use the connection key as network ID (represents the connected pins)
              networkId = connKey
              break
            }
          }
          
          pads.push({
            padId: pinId,
            networkId: networkId,
            type: "rect" as const,
            offset: { x: pinX, y: pinY },
            size: { x: 0.2, y: 0.2 }, // Small size for pins
          })
        }
      }

      return {
        componentId: `partition_${group.partitionIndex}`,
        pads,
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

  override getConstructorParams(): PartitionPackingSolverInput {
    return {
      resolvedLayout: this.resolvedLayout,
      inputProblems: this.inputProblems,
    }
  }
}
