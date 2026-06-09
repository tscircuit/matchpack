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
  ChipPin,
  PartitionInputProblem,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"
import { getPadsBoundingBox } from "./getPadsBoundingBox"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import type { PassiveGroup } from "../IdentifyPassivesSolver/IdentifyPassivesSolver"

const PIN_SIZE = 0.1

export class SingleInnerPartitionPackingSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  declare activeSubSolver: PackSolver2 | null
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  passiveGroups?: PassiveGroup[]

  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
    passiveGroups?: PassiveGroup[]
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.pinIdToStronglyConnectedPins = params.pinIdToStronglyConnectedPins
    this.passiveGroups = params.passiveGroups
  }

  override _step() {
    // Initialize PackSolver2 if not already created
    if (!this.activeSubSolver) {
      const pinToNetworkMap = createFilteredNetworkMapping({
        inputProblem: this.partitionInputProblem,
        pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
      }).pinToNetworkMap

      const packInput = this.createPackInput(pinToNetworkMap)
      this.activeSubSolver = new PackSolver2(packInput)
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

  private createPackInput(pinToNetworkMap: Map<PinId, string>): PackInput {
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
          networkId,
          type: "rect" as const,
          offset: { x: pin.offset.x, y: pin.offset.y },
          size: { x: PIN_SIZE, y: PIN_SIZE },
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

      const fixedRotation = chip.availableRotations?.[0] ?? 0
      return {
        componentId: chipId,
        pads,
        availableRotationDegrees: chip.availableRotations ?? [0, 90, 180, 270],
        ...(chip.fixedPosition && {
          isStatic: true as const,
          center: chip.fixedPosition,
          ccwRotationOffset: fixedRotation,
        }),
      }
    })

    // Add relative constraints for passives
    const relativeConstraints: PackInput["relativeConstraints"] = []
    if (this.passiveGroups) {
      for (const group of this.passiveGroups) {
        // Only if both chips are in this partition
        if (
          this.partitionInputProblem.chipMap[group.mainChipId] &&
          this.partitionInputProblem.chipMap[group.passiveChipId]
        ) {
          const mainPin = this.partitionInputProblem.chipPinMap[group.mainPinId]
          if (!mainPin) continue

          // Suggest placement near the pin
          // We want the passive's center to be near the pin offset
          // Passive pins are usually at x= +/- something. 
          // Let's just suggest a small offset based on the pin side.
          let dx = 0
          let dy = 0
          const gap = 0.5
          if (mainPin.side === "left") dx = -gap
          else if (mainPin.side === "right") dx = gap
          else if (mainPin.side === "top" || mainPin.side === "y+") dy = gap
          else if (mainPin.side === "bottom" || mainPin.side === "y-") dy = -gap

          relativeConstraints.push({
            componentId: group.passiveChipId,
            toComponentId: group.mainChipId,
            relativeOffset: {
              x: mainPin.offset.x + dx,
              y: mainPin.offset.y + dy,
            },
          })
        }
      }
    }

    let minGap = this.partitionInputProblem.chipGap
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      minGap = this.partitionInputProblem.decouplingCapsGap ?? minGap
    }

    return {
      components: packComponents,
      minGap,
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_closest_sum_squared_distance",
      relativeConstraints,
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
          packedComponent.ccwRotationDegrees ??
          packedComponent.ccwRotationOffset ??
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
