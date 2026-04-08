/**
 * Packs the laid out chip partitions into a single layout.
 * Combines all the individually processed partitions into the final schematic layout.
 *
 * KEY CHANGE: Power nets (VCC/VDD/V*) get attractor pads biased upward and
 * ground nets (GND/VSS) get attractor pads biased downward at the partition
 * level too, so the global arrangement also respects the power-up/ground-down
 * schematic convention.
 */

import type { GraphicsObject } from "graphics-debug"
import { type PackInput, PackSolver2 } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { InputProblem } from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import { buildNetVerticalBiasMap } from "../../utils/netBiasUtils"

export interface PartitionPackingSolverInput {
  packedPartitions: PackedPartition[]
  inputProblem: InputProblem
}

export class PartitionPackingSolver extends BaseSolver {
  packedPartitions: PackedPartition[]
  inputProblem: InputProblem
  finalLayout: OutputLayout | null = null
  packSolver2: PackSolver2 | null = null

  constructor(input: PartitionPackingSolverInput) {
    super()
    this.packedPartitions = input.packedPartitions
    this.inputProblem = input.inputProblem
  }

  override _step() {
    try {
      if (this.packedPartitions.length === 0) {
        this.finalLayout = { chipPlacements: {}, groupPlacements: {} }
        this.solved = true
        return
      }

      if (this.packedPartitions.length === 1) {
        this.finalLayout = this.packedPartitions[0]!.layout
        this.solved = true
        return
      }

      const partitionGroups = this.organizePackedPartitions()

      if (!this.packSolver2) {
        const packInput = this.createPackInput(partitionGroups)
        this.packSolver2 = new PackSolver2(packInput)
        this.activeSubSolver = this.packSolver2
      }

      this.packSolver2.step()

      if (this.packSolver2.failed) {
        this.failed = true
        this.error = `PackSolver2 failed: ${this.packSolver2.error}`
        return
      }

      if (this.packSolver2.solved) {
        const packedLayout = this.applyPackingResult(
          this.packSolver2.packedComponents,
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
    bounds: { minX: number; maxX: number; minY: number; maxY: number }
  }> {
    const partitionGroups: Array<{
      partitionIndex: number
      chipIds: string[]
      bounds: { minX: number; maxX: number; minY: number; maxY: number }
    }> = []

    for (let i = 0; i < this.packedPartitions.length; i++) {
      const packedPartition = this.packedPartitions[i]!
      const partitionChipIds = Object.keys(
        packedPartition.layout.chipPlacements,
      )

      if (partitionChipIds.length > 0) {
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity

        for (const chipId of partitionChipIds) {
          const placement = packedPartition.layout.chipPlacements[chipId]!
          const chip = packedPartition.inputProblem.chipMap[chipId]!

          let chipWidth = chip.size.x
          let chipHeight = chip.size.y
          if (
            placement.ccwRotationDegrees === 90 ||
            placement.ccwRotationDegrees === 270
          ) {
            ;[chipWidth, chipHeight] = [chipHeight, chipWidth]
          }

          minX = Math.min(minX, placement.x - chipWidth / 2)
          maxX = Math.max(maxX, placement.x + chipWidth / 2)
          minY = Math.min(minY, placement.y - chipHeight / 2)
          maxY = Math.max(maxY, placement.y + chipHeight / 2)
        }

        partitionGroups.push({
          partitionIndex: i,
          chipIds: partitionChipIds,
          bounds: { minX, maxX, minY, maxY },
        })
      }
    }

    return partitionGroups
  }

  private createPackInput(
    partitionGroups: Array<{
      partitionIndex: number
      chipIds: string[]
      bounds: { minX: number; maxX: number; minY: number; maxY: number }
    }>,
  ): PackInput {
    // Build a global connectivity + vertical-bias map from the full input problem
    const pinToNetworkMap = new Map<string, string>()

    for (const packedPartition of this.packedPartitions) {
      for (const [connKey, connected] of Object.entries(
        packedPartition.inputProblem.netConnMap,
      )) {
        if (!connected) continue
        const [pinId, netId] = connKey.split("-")
        if (pinId && netId) pinToNetworkMap.set(pinId, netId)
      }

      for (const [connKey, connected] of Object.entries(
        packedPartition.inputProblem.pinStrongConnMap,
      )) {
        if (!connected) continue
        const pins = connKey.split("-")
        if (pins.length === 2 && pins[0] && pins[1]) {
          const existingNet =
            pinToNetworkMap.get(pins[0]) || pinToNetworkMap.get(pins[1])
          if (existingNet) {
            pinToNetworkMap.set(pins[0], existingNet)
            pinToNetworkMap.set(pins[1], existingNet)
          } else {
            pinToNetworkMap.set(pins[0], connKey)
            pinToNetworkMap.set(pins[1], connKey)
          }
        }
      }
    }

    // Build the global vertical bias map
    const globalBiasMap = buildNetVerticalBiasMap(this.inputProblem)

    const packComponents = partitionGroups.map((group) => {
      const packedPartition = this.packedPartitions[group.partitionIndex]!

      const partitionWidth = group.bounds.maxX - group.bounds.minX
      const partitionHeight = group.bounds.maxY - group.bounds.minY
      const centerX = (group.bounds.minX + group.bounds.maxX) / 2
      const centerY = (group.bounds.minY + group.bounds.maxY) / 2

      const pads = [
        {
          padId: `partition_${group.partitionIndex}_body`,
          networkId: `partition_${group.partitionIndex}_disconnected`,
          type: "rect" as const,
          offset: { x: 0, y: 0 },
          size: {
            x: Math.max(partitionWidth, 0.1),
            y: Math.max(partitionHeight, 0.1),
          },
        },
      ]

      const addedNetworks = new Set<string>()
      const pinPositions = new Map<string, { x: number; y: number }>()

      for (const chipId of group.chipIds) {
        const chipPlacement = packedPartition.layout.chipPlacements[chipId]!
        const chip = packedPartition.inputProblem.chipMap[chipId]!

        for (const pinId of chip.pins) {
          const chipPin = packedPartition.inputProblem.chipPinMap[pinId]
          if (!chipPin) continue

          let transformedOffset = { x: chipPin.offset.x, y: chipPin.offset.y }
          const rotation = chipPlacement.ccwRotationDegrees || 0
          if (rotation === 90)
            transformedOffset = { x: -chipPin.offset.y, y: chipPin.offset.x }
          else if (rotation === 180)
            transformedOffset = { x: -chipPin.offset.x, y: -chipPin.offset.y }
          else if (rotation === 270)
            transformedOffset = { x: chipPin.offset.y, y: -chipPin.offset.x }

          const absolutePinX = chipPlacement.x + transformedOffset.x
          const absolutePinY = chipPlacement.y + transformedOffset.y
          pinPositions.set(pinId, { x: absolutePinX, y: absolutePinY })

          const networkId =
            pinToNetworkMap.get(pinId) || `${pinId}_disconnected`

          if (!addedNetworks.has(networkId)) {
            addedNetworks.add(networkId)

            const padOffsetX = absolutePinX - centerX
            const padOffsetY = absolutePinY - centerY

            pads.push({
              padId: `${group.partitionIndex}_pin_${pinId}`,
              networkId,
              type: "rect" as const,
              offset: { x: padOffsetX, y: padOffsetY },
              size: { x: 0.01, y: 0.01 },
            })

            // Add vertical-bias attractor pad for power/ground nets
            const verticalBias = globalBiasMap.get(pinId)
            if (verticalBias !== undefined) {
              pads.push({
                padId: `${group.partitionIndex}_pin_${pinId}_bias`,
                networkId,
                type: "rect" as const,
                offset: { x: padOffsetX, y: padOffsetY + verticalBias },
                size: { x: 0.01, y: 0.01 },
              })
            }
          }
        }
      }

      return {
        componentId: `partition_${group.partitionIndex}`,
        pads,
        availableRotationDegrees: [0] as Array<0 | 90 | 180 | 270>,
      }
    })

    return {
      components: packComponents,
      minGap: this.inputProblem.partitionGap,
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_sum_squared_distance_to_network",
    }
  }

  private applyPackingResult(
    packedComponents: PackSolver2["packedComponents"],
    partitionGroups: Array<{
      partitionIndex: number
      chipIds: string[]
      bounds: { minX: number; maxX: number; minY: number; maxY: number }
    }>,
  ): OutputLayout {
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
        const currentCenterX = (group.bounds.minX + group.bounds.maxX) / 2
        const currentCenterY = (group.bounds.minY + group.bounds.maxY) / 2
        const offsetX = packedComponent.center.x - currentCenterX
        const offsetY = packedComponent.center.y - currentCenterY

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

    return { chipPlacements: newChipPlacements, groupPlacements: {} }
  }

  override visualize(): GraphicsObject {
    if (this.packSolver2 && !this.solved) return this.packSolver2.visualize()
    if (!this.finalLayout) return super.visualize()

    const combinedProblem: InputProblem = {
      chipMap: {},
      chipPinMap: {},
      pinStrongConnMap: {},
      netMap: {},
      netConnMap: {},
      chipGap: this.inputProblem.chipGap,
      partitionGap: this.inputProblem.partitionGap,
    }

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
