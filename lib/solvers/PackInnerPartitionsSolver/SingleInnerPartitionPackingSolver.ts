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
    // Specialized layout for decoupling capacitors: linear row implementation
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      this.layout = this.createLinearLayout()
      this.solved = true
      return
    }

    // Initialize PackSolver2 if not already created
    if (!this.activeSubSolver) {
      const packInput = this.createPackInput()
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

  private createLinearLayout(): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}
    const chips = Object.values(this.partitionInputProblem.chipMap)
    const gap = this.partitionInputProblem.decouplingCapsGap ?? this.partitionInputProblem.chipGap ?? 0.1
    
    let currentX = 0
    for (const chip of chips) {
      const chipWidth = chip.size.x
      // Place centered at currentX + chipWidth / 2
      chipPlacements[chip.chipId] = {
        x: currentX + chipWidth / 2,
        y: 0,
        ccwRotationDegrees: chip.availableRotations?.[0] ?? 0,
      }
      currentX += chipWidth + gap
    }

    // Centering the row around (0,0)
    const totalWidth = currentX - gap
    const offsetX = -totalWidth / 2
    for (const chipId in chipPlacements) {
      chipPlacements[chipId]!.x += offsetX
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  private createPackInput(): PackInput {
    // Fall back to filtered mapping (weak + strong)
    const pinToNetworkMap = createFilteredNetworkMapping({
      inputProblem: this.partitionInputProblem,
      pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
    }).pinToNetworkMap

    // Create pack components for each chip
    const packComponents = Object.entries(this.partitionInputProblem.chipMap)
      .map(([chipId, chip]) => {
        // ... (existing logic for pads)
        const pads: Array<{
          padId: string
          networkId: string
          type: "rect"
          offset: { x: number; y: number }
          size: { x: number; y: number }
        }> = []

        for (const pinId of chip.pins) {
          const pin = this.partitionInputProblem.chipPinMap[pinId]
          if (!pin) continue
          const networkId = pinToNetworkMap.get(pinId) || `${pinId}_isolated`
          pads.push({
            padId: pinId,
            networkId: networkId,
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
          pinCount: chip.pins.length, // Add pinCount for sorting
        }
      })
      .sort((a, b) => b.pinCount - a.pinCount) // Sort by pin count descending

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
