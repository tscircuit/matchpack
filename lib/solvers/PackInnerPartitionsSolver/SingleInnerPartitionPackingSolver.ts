/**
 * Packs components within a single partition to create an optimal internal layout.
 * Uses a packing algorithm to arrange chips and their connections within the partition.
 */

import type { GraphicsObject } from "graphics-debug"
import { type PackInput, PackSolver2 } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  InputProblem,
  PinId,
  ChipId,
  NetId,
  ChipPin,
  PartitionInputProblem,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"
import { getPadsBoundingBox } from "./getPadsBoundingBox"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

const PIN_SIZE = 0.1

export class SingleInnerPartitionPackingSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  declare activeSubSolver: PackSolver2 | null
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>

  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.pinIdToStronglyConnectedPins = params.pinIdToStronglyConnectedPins
  }

  override _step() {
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      this.layout = this.createDecouplingCapLayout()
      this.solved = true
      this.activeSubSolver = null
      return
    }

    // Initialize PackSolver2 if not already created
    if (!this.activeSubSolver) {
      const packInput = this.createPackInput()
      this.activeSubSolver = new PackSolver2(packInput)
      this.activeSubSolver = this.activeSubSolver
    }

    // Run one step of the PackSolver2
    this.activeSubSolver.step()

    if (this.activeSubSolver.failed) {
      this.failed = true
      this.error = `PackSolver2 failed: ${this.activeSubSolver.error}`
      return
    }

    if (this.activeSubSolver.solved) {
      // Apply the packing result to create the layout
      this.layout = this.createLayoutFromPackingResult(
        this.activeSubSolver.packedComponents,
      )
      this.solved = true
      this.activeSubSolver = null
    }
  }

  private createDecouplingCapLayout(): OutputLayout {
    const chipIds = Object.keys(this.partitionInputProblem.chipMap)
    const direction = this.getDecouplingCapLayoutDirection(chipIds)
    const sortedChipIds = this.sortDecouplingCapChipIds(chipIds, direction)
    const gap =
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap
    const pitch = this.getDecouplingCapPitch(sortedChipIds, direction, gap)
    const midpoint = (sortedChipIds.length - 1) / 2
    const chipPlacements: Record<string, Placement> = {}

    for (let i = 0; i < sortedChipIds.length; i++) {
      const chipId = sortedChipIds[i]!
      const chip = this.partitionInputProblem.chipMap[chipId]!
      const rotation = this.chooseDecouplingCapRotation(chip.availableRotations)
      const centeredIndex = i - midpoint

      chipPlacements[chipId] = {
        x: direction === "horizontal" ? centeredIndex * pitch : 0,
        y: direction === "vertical" ? -centeredIndex * pitch : 0,
        ccwRotationDegrees: rotation,
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  private getDecouplingCapLayoutDirection(
    chipIds: ChipId[],
  ): "horizontal" | "vertical" {
    let xSideConnections = 0
    let ySideConnections = 0

    for (const chipId of chipIds) {
      for (const pin of this.getExternalStrongPinsForChip(chipId)) {
        if (pin.side === "x-" || pin.side === "x+") xSideConnections++
        if (pin.side === "y-" || pin.side === "y+") ySideConnections++
      }
    }

    return xSideConnections >= ySideConnections ? "vertical" : "horizontal"
  }

  private sortDecouplingCapChipIds(
    chipIds: ChipId[],
    direction: "horizontal" | "vertical",
  ): ChipId[] {
    return [...chipIds].sort((chipIdA, chipIdB) => {
      const keyA = this.getDecouplingCapSortKey(chipIdA, direction)
      const keyB = this.getDecouplingCapSortKey(chipIdB, direction)

      if (keyA !== keyB) return keyA - keyB
      return chipIdA.localeCompare(chipIdB, undefined, { numeric: true })
    })
  }

  private getDecouplingCapSortKey(
    chipId: ChipId,
    direction: "horizontal" | "vertical",
  ): number {
    const externalPins = this.getExternalStrongPinsForChip(chipId)
    if (externalPins.length === 0) return 0

    const coordinateSum = externalPins.reduce((sum, pin) => {
      return sum + (direction === "vertical" ? -pin.offset.y : pin.offset.x)
    }, 0)

    return coordinateSum / externalPins.length
  }

  private getExternalStrongPinsForChip(chipId: ChipId): ChipPin[] {
    const chip = this.partitionInputProblem.chipMap[chipId]
    if (!chip) return []

    const partitionPinIds = new Set(
      Object.keys(this.partitionInputProblem.chipPinMap),
    )
    const externalPins: ChipPin[] = []

    for (const pinId of chip.pins) {
      const stronglyConnectedPins =
        this.pinIdToStronglyConnectedPins[pinId] ?? []

      for (const connectedPin of stronglyConnectedPins) {
        if (!partitionPinIds.has(connectedPin.pinId)) {
          externalPins.push(connectedPin)
        }
      }
    }

    return externalPins
  }

  private getDecouplingCapPitch(
    chipIds: ChipId[],
    direction: "horizontal" | "vertical",
    gap: number,
  ): number {
    const maxAxisSize = chipIds.reduce((maxSize, chipId) => {
      const chip = this.partitionInputProblem.chipMap[chipId]
      if (!chip) return maxSize
      const rotation = this.chooseDecouplingCapRotation(chip.availableRotations)
      const size = this.getRotatedChipSize(chip.size, rotation)
      const axisSize = direction === "horizontal" ? size.x : size.y
      return Math.max(maxSize, axisSize)
    }, 0)

    return maxAxisSize + gap
  }

  private chooseDecouplingCapRotation(
    availableRotations?: Array<0 | 90 | 180 | 270>,
  ): 0 | 90 | 180 | 270 {
    if (!availableRotations || availableRotations.length === 0) return 0
    return availableRotations.includes(0) ? 0 : availableRotations[0]!
  }

  private getRotatedChipSize(
    size: { x: number; y: number },
    rotation: number,
  ): { x: number; y: number } {
    return rotation === 90 || rotation === 270 ? { x: size.y, y: size.x } : size
  }

  private createPackInput(): PackInput {
    // Fall back to filtered mapping (weak + strong)
    const pinToNetworkMap = createFilteredNetworkMapping({
      inputProblem: this.partitionInputProblem,
      pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
    }).pinToNetworkMap

    // Create pack components for each chip
    const packComponents = Object.entries(
      this.partitionInputProblem.chipMap,
    ).map(([chipId, chip]) => {
      // Create pads for all pins of this chip
      const pads: Array<{
        padId: string
        networkId: string
        type: "rect"
        offset: { x: number; y: number }
        size: { x: number; y: number }
      }> = []

      // Create a pad for each pin on this chip
      for (const pinId of chip.pins) {
        const pin = this.partitionInputProblem.chipPinMap[pinId]
        if (!pin) continue

        // Find network for this pin from our connectivity map
        const networkId = pinToNetworkMap.get(pinId) || `${pinId}_isolated`

        pads.push({
          padId: pinId,
          networkId: networkId,
          type: "rect" as const,
          offset: { x: pin.offset.x, y: pin.offset.y },
          size: { x: PIN_SIZE, y: PIN_SIZE }, // Small size for pins
        })
      }

      const padsBoundingBox = getPadsBoundingBox(pads)
      const padsBoundingBoxSize = {
        x: padsBoundingBox.maxX - padsBoundingBox.minX,
        y: padsBoundingBox.maxY - padsBoundingBox.minY,
      }

      // Add chip body pad (disconnected from any network) but make sure
      // it fully envelopes the "pads" (pins)

      pads.push({
        padId: `${chipId}_body`,
        networkId: `${chipId}_body_disconnected`,
        type: "rect" as const,
        offset: { x: 0, y: 0 },
        size: {
          x: Math.max(padsBoundingBoxSize.x, chip.size.x),
          y: Math.max(padsBoundingBoxSize.y, chip.size.y),
        },
      })

      return {
        componentId: chipId,
        pads,
        availableRotationDegrees: chip.availableRotations || [0, 90, 180, 270],
      }
    })

    let minGap = this.partitionInputProblem.chipGap
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      minGap = this.partitionInputProblem.decouplingCapsGap ?? minGap
    }

    return {
      components: packComponents,
      minGap,
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_closest_sum_squared_distance",
    }
  }

  private createLayoutFromPackingResult(
    packedComponents: PackSolver2["packedComponents"],
  ): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}

    for (const packedComponent of packedComponents) {
      const chipId = packedComponent.componentId

      chipPlacements[chipId] = {
        x: packedComponent.center.x,
        y: packedComponent.center.y,
        ccwRotationDegrees:
          packedComponent.ccwRotationOffset ||
          packedComponent.ccwRotationDegrees ||
          0,
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver && !this.solved) {
      return this.activeSubSolver.visualize()
    }

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
