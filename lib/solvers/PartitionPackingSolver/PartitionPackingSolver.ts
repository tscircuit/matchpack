/**
 * Packs the laid out chip partitions into a single layout.
 * Combines all the individually processed partitions into the final schematic layout.
 */

import type { GraphicsObject } from "graphics-debug"
import { type PackInput, PackSolver2 } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { InputProblem, PinId, NetId } from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

export interface PartitionPackingSolverInput {
  packedPartitions: PackedPartition[]
  inputProblem: InputProblem
}

type PartitionGroup = {
  partitionIndex: number
  chipIds: string[]
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
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

  private partitionHasFixedChip(partitionIndex: number): boolean {
    const packedPartition = this.packedPartitions[partitionIndex]
    if (!packedPartition) return false
    return Object.values(packedPartition.inputProblem.chipMap).some(
      (chip) => chip.fixedPosition !== undefined,
    )
  }

  override _step() {
    try {
      if (this.packedPartitions.length === 0) {
        this.finalLayout = { chipPlacements: {}, groupPlacements: {} }
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

      // Initialize PackSolver2 if not already created
      if (!this.packSolver2) {
        const packInput = this.createPackInput(partitionGroups)
        this.packSolver2 = new PackSolver2(packInput)
        this.activeSubSolver = this.packSolver2
      }

      // Run one step of the PackSolver2
      this.packSolver2.step()

      if (this.packSolver2.failed) {
        this.failed = true
        this.error = `PackSolver2 failed: ${this.packSolver2.error}`
        return
      }

      if (this.packSolver2.solved) {
        // Apply the packing result to the layout
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

  private buildConnectivityMap(): Map<PinId, NetId> {
    const pinToNetworkMap = new Map<PinId, NetId>()
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
    return pinToNetworkMap
  }

  private organizePackedPartitions(): PartitionGroup[] {
    const partitionGroups: PartitionGroup[] = []

    for (let i = 0; i < this.packedPartitions.length; i++) {
      const packedPartition = this.packedPartitions[i]!
      const partitionChipIds = Object.keys(
        packedPartition.layout.chipPlacements,
      )

      if (partitionChipIds.length > 0) {
        // Calculate bounding box for this partition including chip sizes
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity

        for (const chipId of partitionChipIds) {
          const placement = packedPartition.layout.chipPlacements[chipId]!
          const chip = packedPartition.inputProblem.chipMap[chipId]!

          // Account for chip size and rotation
          let chipWidth = chip.size.x
          let chipHeight = chip.size.y
          if (
            placement.ccwRotationDegrees === 90 ||
            placement.ccwRotationDegrees === 270
          ) {
            // Swap width and height for 90/270 degree rotations
            ;[chipWidth, chipHeight] = [chipHeight, chipWidth]
          }

          const chipMinX = placement.x - chipWidth / 2
          const chipMaxX = placement.x + chipWidth / 2
          const chipMinY = placement.y - chipHeight / 2
          const chipMaxY = placement.y + chipHeight / 2

          minX = Math.min(minX, chipMinX)
          maxX = Math.max(maxX, chipMaxX)
          minY = Math.min(minY, chipMinY)
          maxY = Math.max(maxY, chipMaxY)
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

  private createPackInput(groups: PartitionGroup[]): PackInput {
    const pinToNetworkMap = this.buildConnectivityMap()

    const packComponents = groups.map((group) => {
      const packedPartition = this.packedPartitions[group.partitionIndex]!
      const isFixed = this.partitionHasFixedChip(group.partitionIndex)

      // Calculate partition size from bounds
      const partitionWidth = group.bounds.maxX - group.bounds.minX
      const partitionHeight = group.bounds.maxY - group.bounds.minY
      const centerX = (group.bounds.minX + group.bounds.maxX) / 2
      const centerY = (group.bounds.minY + group.bounds.maxY) / 2

      // Start with the partition body pad
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

      // Add all pins from this partition as pads
      const addedNetworks = new Set<string>()

      // Calculate pin positions for all chips in the partition
      for (const chipId of group.chipIds) {
        const chipPlacement = packedPartition.layout.chipPlacements[chipId]!
        const chip = packedPartition.inputProblem.chipMap[chipId]!

        for (const pinId of chip.pins) {
          const chipPin = packedPartition.inputProblem.chipPinMap[pinId]
          if (!chipPin) continue

          let rotatedPinOffset = { x: chipPin.offset.x, y: chipPin.offset.y }
          const chipRotationDeg = chipPlacement.ccwRotationDegrees ?? 0
          if (chipRotationDeg === 90) {
            rotatedPinOffset = { x: -chipPin.offset.y, y: chipPin.offset.x }
          } else if (chipRotationDeg === 180) {
            rotatedPinOffset = { x: -chipPin.offset.x, y: -chipPin.offset.y }
          } else if (chipRotationDeg === 270) {
            rotatedPinOffset = { x: chipPin.offset.y, y: -chipPin.offset.x }
          }

          const absolutePinX = chipPlacement.x + rotatedPinOffset.x
          const absolutePinY = chipPlacement.y + rotatedPinOffset.y
          const networkId =
            pinToNetworkMap.get(pinId) ?? `${pinId}_disconnected`

          // Only add one pad per network to avoid overlapping
          if (!addedNetworks.has(networkId)) {
            addedNetworks.add(networkId)
            pads.push({
              padId: `${group.partitionIndex}_pin_${pinId}`,
              networkId,
              type: "rect" as const,
              offset: { x: absolutePinX - centerX, y: absolutePinY - centerY },
              size: { x: 0.01, y: 0.01 },
            })
          }
        }
      }

      return {
        componentId: `partition_${group.partitionIndex}`,
        pads,
        availableRotationDegrees: [0] as Array<0 | 90 | 180 | 270>,
        ...(isFixed && {
          isStatic: true as const,
          center: { x: centerX, y: centerY },
          ccwRotationOffset: 0,
        }),
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
    partitionGroups: PartitionGroup[],
  ): OutputLayout {
    const aspectRatioBalancedComponents = this.balanceDistantPairAspectRatio(
      packedComponents,
      partitionGroups,
    )

    // Apply the partition offsets to individual components
    const newChipPlacements: Record<string, Placement> = {}

    for (const packedComponent of aspectRatioBalancedComponents) {
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

  /**
   * A pair of partitions connected only by a global rail (typically GND) has
   * no meaningful routing preference between vertical and horizontal packing.
   * Prefer the horizontal candidate so these distant groups do not make the
   * overall schematic portrait-oriented.
   */
  private balanceDistantPairAspectRatio(
    packedComponents: PackSolver2["packedComponents"],
    partitionGroups: PartitionGroup[],
  ): PackSolver2["packedComponents"] {
    if (
      packedComponents.length !== 2 ||
      this.countSharedNetworks(partitionGroups) > 1 ||
      partitionGroups.some((group) =>
        this.partitionHasFixedChip(group.partitionIndex),
      )
    ) {
      return packedComponents
    }

    const [anchor, moving] = packedComponents
    if (!anchor || !moving) return packedComponents

    const deltaX = Math.abs(moving.center.x - anchor.center.x)
    const deltaY = Math.abs(moving.center.y - anchor.center.y)
    if (deltaX >= deltaY) return packedComponents

    const anchorIndex = Number(anchor.componentId.replace("partition_", ""))
    const movingIndex = Number(moving.componentId.replace("partition_", ""))
    const anchorGroup = partitionGroups.find(
      (group) => group.partitionIndex === anchorIndex,
    )
    const movingGroup = partitionGroups.find(
      (group) => group.partitionIndex === movingIndex,
    )
    if (!anchorGroup || !movingGroup) return packedComponents

    const anchorWidth = anchorGroup.bounds.maxX - anchorGroup.bounds.minX
    const movingWidth = movingGroup.bounds.maxX - movingGroup.bounds.minX
    const horizontalDistance =
      anchorWidth / 2 + this.inputProblem.partitionGap + movingWidth / 2

    return [
      anchor,
      {
        ...moving,
        center: {
          x: anchor.center.x + horizontalDistance,
          y: anchor.center.y,
        },
      },
    ]
  }

  private countSharedNetworks(partitionGroups: PartitionGroup[]): number {
    if (partitionGroups.length !== 2) return 0

    const pinToNetworkMap = this.buildConnectivityMap()
    const networksByGroup = partitionGroups.map((group) => {
      const networks = new Set<NetId>()
      for (const chipId of group.chipIds) {
        const chip = this.inputProblem.chipMap[chipId]
        if (!chip) continue
        for (const pinId of chip.pins) {
          const networkId = pinToNetworkMap.get(pinId)
          if (networkId) networks.add(networkId)
        }
      }
      return networks
    })

    const [firstNetworks, secondNetworks] = networksByGroup
    if (!firstNetworks || !secondNetworks) return 0
    return [...firstNetworks].filter((networkId) =>
      secondNetworks.has(networkId),
    ).length
  }

  private getCombinedPackedPartitionsProblem(): InputProblem {
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

    return combinedProblem
  }

  private getCombinedPackedPartitionsLayout(): OutputLayout {
    const chipPlacements: OutputLayout["chipPlacements"] = {}

    for (const packedPartition of this.packedPartitions) {
      Object.assign(chipPlacements, packedPartition.layout.chipPlacements)
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (this.packSolver2 && !this.solved) {
      return this.packSolver2.visualize()
    }

    if (!this.finalLayout) {
      if (this.packedPartitions.length === 0) {
        return super.visualize()
      }

      return visualizeInputProblem(
        this.getCombinedPackedPartitionsProblem(),
        this.getCombinedPackedPartitionsLayout(),
      )
    }

    return visualizeInputProblem(
      this.getCombinedPackedPartitionsProblem(),
      this.finalLayout,
    )
  }

  override getConstructorParams(): PartitionPackingSolverInput {
    return {
      packedPartitions: this.packedPartitions,
      inputProblem: this.inputProblem,
    }
  }
}
