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

const PIN_SIZE = 0.1

export class SingleInnerPartitionPackingSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  override activeSubSolver: PackSolver2 | null = null
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
    // Specialized layout for decoupling capacitors
    if (
      this.partitionInputProblem.partitionType === "decoupling_caps" &&
      !this.solved
    ) {
      this.layout = this.createLinearDecouplingCapLayout()
      this.solved = true
      return
    }

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

  /**
   * Creates a specialized linear layout for decoupling capacitors.
   * Arranges them in a clean horizontal row centered at (0,0).
   */
  private createLinearDecouplingCapLayout(): OutputLayout {
    const chips = Object.values(this.partitionInputProblem.chipMap).sort(
      (a, b) => a.chipId.localeCompare(b.chipId),
    )
    const gap =
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap

    const chipPlacements: Record<string, Placement> = {}

    // Calculate total width of the row
    let totalWidth = 0
    for (let i = 0; i < chips.length; i++) {
      totalWidth += chips[i]!.size.x
      if (i < chips.length - 1) {
        totalWidth += gap
      }
    }

    // Place chips starting from the left, centering the row at x=0
    let currentX = -totalWidth / 2
    for (const chip of chips) {
      const halfWidth = chip.size.x / 2
      chipPlacements[chip.chipId] = {
        x: currentX + halfWidth,
        y: 0,
        ccwRotationDegrees: 0,
      }
      currentX += chip.size.x + gap
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
