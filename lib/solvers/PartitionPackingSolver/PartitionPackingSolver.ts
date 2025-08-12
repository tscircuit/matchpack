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

// Each partition is an InputProblem representing a connected component that was laid out independently
export type LaidOutPartition = InputProblem

export interface PartitionPackingSolverInput {
  resolvedLayout: OutputLayout
  laidOutPartitions: LaidOutPartition[]
  inputProblem: InputProblem
}

export class PartitionPackingSolver extends BaseSolver {
  resolvedLayout: OutputLayout
  laidOutPartitions: LaidOutPartition[]
  inputProblem: InputProblem
  finalLayout: OutputLayout | null = null
  phasedPackSolver: PhasedPackSolver | null = null

  constructor(input: PartitionPackingSolverInput) {
    super()
    this.resolvedLayout = input.resolvedLayout
    this.laidOutPartitions = input.laidOutPartitions
    this.inputProblem = input.inputProblem
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
    // Group chips by partition based on which laid out partition they belong to
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

    for (let i = 0; i < this.laidOutPartitions.length; i++) {
      const laidOutPartition = this.laidOutPartitions[i]!
      const partitionChipIds: string[] = []

      // Find chips from this partition that are in the layout
      for (const chipId of Object.keys(laidOutPartition.chipMap)) {
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

    // Build a global connectivity map to properly assign networkIds
    const pinToNetworkMap = new Map<string, string>()

    // First, process all partitions to build the connectivity map
    for (const laidOutPartition of this.laidOutPartitions) {
      // Process net connections
      for (const [connKey, connected] of Object.entries(
        laidOutPartition.netConnMap,
      )) {
        if (!connected) continue
        const [pinId, netId] = connKey.split("-")
        if (pinId && netId) {
          pinToNetworkMap.set(pinId, netId)
        }
      }

      // Process strong connections - these form their own networks
      for (const [connKey, connected] of Object.entries(
        laidOutPartition.pinStrongConnMap,
      )) {
        if (!connected) continue
        const pins = connKey.split("-")
        if (pins.length === 2 && pins[0] && pins[1]) {
          // If either pin already has a net connection, use that network for both
          const existingNet =
            pinToNetworkMap.get(pins[0]) || pinToNetworkMap.get(pins[1])
          if (existingNet) {
            pinToNetworkMap.set(pins[0], existingNet)
            pinToNetworkMap.set(pins[1], existingNet)
          } else {
            // Otherwise, use the connection itself as the network
            pinToNetworkMap.set(pins[0], connKey)
            pinToNetworkMap.set(pins[1], connKey)
          }
        }
      }
    }

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
        const chip =
          this.laidOutPartitions[group.partitionIndex]!.chipMap[chipId]!
        const chipPinMap =
          this.laidOutPartitions[group.partitionIndex]!.chipPinMap

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

          // Find network for this pin from our global connectivity map
          const networkId = pinToNetworkMap.get(pinId) || pinId

          pads.push({
            padId: pinId,
            networkId: networkId,
            type: "rect" as const,
            offset: { x: pinX, y: pinY },
            size: { x: 0.2, y: 0.2 }, // Small size for pins
          })
        }
      }

      // Calculate intersection of availableRotations for all chips in this partition
      let availableRotationDegrees: Array<0 | 90 | 180 | 270> = [
        0, 90, 180, 270,
      ]

      for (const chipId of group.chipIds) {
        const chip =
          this.laidOutPartitions[group.partitionIndex]!.chipMap[chipId]!
        const chipRotations = chip.availableRotations || [0, 90, 180, 270]

        // Take intersection with current available rotations
        availableRotationDegrees = availableRotationDegrees.filter((rotation) =>
          chipRotations.includes(rotation),
        )
      }

      // If intersection is empty, default to [0]
      if (availableRotationDegrees.length === 0) {
        availableRotationDegrees = [0]
      }

      return {
        componentId: `partition_${group.partitionIndex}`,
        pads,
        availableRotationDegrees,
      }
    })

    return {
      components: packComponents,
      minGap: this.inputProblem.partitionGap, // Use partitionGap from input problem
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

    // Create a combined problem for visualization from all laid out partitions
    const combinedProblem: InputProblem = {
      chipMap: {},
      groupMap: {},
      chipPinMap: {},
      groupPinMap: {},
      pinStrongConnMap: {},
      netMap: {},
      netConnMap: {},
      chipGap: this.inputProblem.chipGap,
      partitionGap: this.inputProblem.partitionGap,
    }

    // Combine all laid out partitions
    for (const laidOutPartition of this.laidOutPartitions) {
      Object.assign(combinedProblem.chipMap, laidOutPartition.chipMap)
      Object.assign(combinedProblem.groupMap, laidOutPartition.groupMap)
      Object.assign(combinedProblem.chipPinMap, laidOutPartition.chipPinMap)
      Object.assign(combinedProblem.groupPinMap, laidOutPartition.groupPinMap)
      Object.assign(
        combinedProblem.pinStrongConnMap,
        laidOutPartition.pinStrongConnMap,
      )
      Object.assign(combinedProblem.netMap, laidOutPartition.netMap)
      Object.assign(combinedProblem.netConnMap, laidOutPartition.netConnMap)
    }

    return visualizeInputProblem(combinedProblem, this.finalLayout)
  }

  override getConstructorParams(): PartitionPackingSolverInput {
    return {
      resolvedLayout: this.resolvedLayout,
      laidOutPartitions: this.laidOutPartitions,
      inputProblem: this.inputProblem,
    }
  }
}
