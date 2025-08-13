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
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

export interface PartitionPackingSolverInput {
  packedPartitions: PackedPartition[]
  inputProblem: InputProblem
}

export class PartitionPackingSolver extends BaseSolver {
  packedPartitions: PackedPartition[]
  inputProblem: InputProblem
  finalLayout: OutputLayout | null = null
  phasedPackSolver: PhasedPackSolver | null = null

  constructor(input: PartitionPackingSolverInput) {
    super()
    this.packedPartitions = input.packedPartitions
    this.inputProblem = input.inputProblem
  }

  override _step() {
    try {
      if (this.packedPartitions.length === 0) {
        // No partitions to pack, create empty layout
        this.finalLayout = {
          chipPlacements: {},
          groupPlacements: {},
        }
        this.solved = true
        return
      }

      if (this.packedPartitions.length === 1) {
        // Only one partition, use its layout directly
        this.finalLayout = this.packedPartitions[0]!.layout
        this.solved = true
        return
      }

      // Create groups of components by partition for better organization
      const partitionGroups = this.organizePackedPartitions()

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

  private organizePackedPartitions(): Array<{
    partitionIndex: number
    chipIds: string[]
    bounds: {
      minX: number
      maxX: number
      minY: number
      maxY: number
    }
  }> {
    // Group chips by partition based on packed partitions
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

    for (let i = 0; i < this.packedPartitions.length; i++) {
      const packedPartition = this.packedPartitions[i]!
      const partitionChipIds = Object.keys(
        packedPartition.layout.chipPlacements,
      )

      if (partitionChipIds.length > 0) {
        // Calculate bounding box for this partition
        const xs = partitionChipIds.map(
          (chipId) => packedPartition.layout.chipPlacements[chipId]!.x,
        )
        const ys = partitionChipIds.map(
          (chipId) => packedPartition.layout.chipPlacements[chipId]!.y,
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
    // Build a global connectivity map to properly assign networkIds
    const pinToNetworkMap = new Map<string, string>()

    // First, process all partitions to build the connectivity map
    for (const packedPartition of this.packedPartitions) {
      // Process net connections
      for (const [connKey, connected] of Object.entries(
        packedPartition.inputProblem.netConnMap,
      )) {
        if (!connected) continue
        const [pinId, netId] = connKey.split("-")
        if (pinId && netId) {
          pinToNetworkMap.set(pinId, netId)
        }
      }

      // Process strong connections - these form their own networks
      for (const [connKey, connected] of Object.entries(
        packedPartition.inputProblem.pinStrongConnMap,
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
      const packedPartition = this.packedPartitions[group.partitionIndex]!

      // Calculate partition size from bounds
      const partitionWidth = group.bounds.maxX - group.bounds.minX
      const partitionHeight = group.bounds.maxY - group.bounds.minY

      // Create a single pad representing the entire partition
      const pads = [
        {
          padId: `partition_${group.partitionIndex}_body`,
          networkId: `partition_${group.partitionIndex}_disconnected`,
          type: "rect" as const,
          offset: { x: 0, y: 0 },
          size: {
            x: Math.max(partitionWidth, 1),
            y: Math.max(partitionHeight, 1),
          },
        },
      ]

      // Add connectivity pads for inter-partition connections
      const interPartitionConnections = new Set<string>()

      // Find pins that connect to other partitions
      for (const [connKey, connected] of Object.entries(
        packedPartition.inputProblem.netConnMap,
      )) {
        if (!connected) continue
        const [pinId, netId] = connKey.split("-")
        if (pinId && netId) {
          // Check if this net exists in other partitions
          for (let i = 0; i < this.packedPartitions.length; i++) {
            if (i === group.partitionIndex) continue
            const otherPartition = this.packedPartitions[i]!
            if (
              Object.keys(otherPartition.inputProblem.netMap).includes(netId!)
            ) {
              interPartitionConnections.add(netId!)
            }
          }
        }
      }

      // Add pads for inter-partition connections
      for (const networkId of interPartitionConnections) {
        pads.push({
          padId: `${group.partitionIndex}_net_${networkId}`,
          networkId: networkId,
          type: "rect" as const,
          offset: { x: partitionWidth / 2, y: partitionHeight / 2 },
          size: { x: 0.1, y: 0.1 },
        })
      }

      return {
        componentId: `partition_${group.partitionIndex}`,
        pads,
        availableRotationDegrees: [0] as Array<0 | 90 | 180 | 270>, // Keep partitions unrotated
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
      const packedPartition = this.packedPartitions[partitionIndex]

      if (group && packedPartition) {
        // Calculate offset to apply to this partition's components
        const currentCenterX = (group.bounds.minX + group.bounds.maxX) / 2
        const currentCenterY = (group.bounds.minY + group.bounds.maxY) / 2
        const newCenterX = packedComponent.center.x
        const newCenterY = packedComponent.center.y

        const offsetX = newCenterX - currentCenterX
        const offsetY = newCenterY - currentCenterY

        // Apply offset to all chips in this partition
        for (const chipId of group.chipIds) {
          const originalPlacement =
            packedPartition.layout.chipPlacements[chipId]!
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
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (this.phasedPackSolver && !this.solved) {
      return this.phasedPackSolver.visualize()
    }

    if (!this.finalLayout) {
      return super.visualize()
    }

    // Create a combined problem for visualization from all packed partitions
    const combinedProblem: InputProblem = {
      chipMap: {},
      chipPinMap: {},
      pinStrongConnMap: {},
      netMap: {},
      netConnMap: {},
      chipGap: this.inputProblem.chipGap,
      partitionGap: this.inputProblem.partitionGap,
    }

    // Combine all packed partitions
    for (const packedPartition of this.packedPartitions) {
      Object.assign(
        combinedProblem.chipMap,
        packedPartition.inputProblem.chipMap,
      )
      Object.assign(
        combinedProblem.chipPinMap,
        packedPartition.inputProblem.chipPinMap,
      )
      Object.assign(
        combinedProblem.pinStrongConnMap,
        packedPartition.inputProblem.pinStrongConnMap,
      )
      Object.assign(combinedProblem.netMap, packedPartition.inputProblem.netMap)
      Object.assign(
        combinedProblem.netConnMap,
        packedPartition.inputProblem.netConnMap,
      )
    }

    return visualizeInputProblem(combinedProblem, this.finalLayout)
  }

  override getConstructorParams(): PartitionPackingSolverInput {
    return {
      packedPartitions: this.packedPartitions,
      inputProblem: this.inputProblem,
    }
  }
}
