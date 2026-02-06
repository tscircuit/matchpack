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
    // For decoupling cap partitions, use specialized linear layout
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      this.layout = this.createDecouplingCapsLayout()
      this.solved = true
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

  /**
   * Creates a specialized linear layout for decoupling capacitors.
   * Arranges them in a horizontal row with consistent spacing and orientation.
   */
  private createDecouplingCapsLayout(): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}
    const chips = Object.values(this.partitionInputProblem.chipMap)

    if (chips.length === 0) {
      return { chipPlacements, groupPlacements: {} }
    }

    // Get the gap to use between capacitors
    const gap =
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap

    // Sort chips by ID for consistent ordering
    const sortedChips = [...chips].sort((a, b) =>
      a.chipId.localeCompare(b.chipId),
    )

    // Determine if chips should be laid out horizontally or vertically
    // Prefer horizontal if chips are taller than they are wide
    const firstChip = sortedChips[0]!
    const isHorizontalLayout = firstChip.size.y > firstChip.size.x

    // Calculate positions for each chip in a linear arrangement
    let currentOffset = 0

    for (const chip of sortedChips) {
      // Use rotation 0 for consistent orientation
      const rotation = 0

      if (isHorizontalLayout) {
        // Horizontal row layout
        const x = currentOffset + chip.size.x / 2
        const y = 0

        chipPlacements[chip.chipId] = {
          x,
          y,
          ccwRotationDegrees: rotation,
        }

        currentOffset += chip.size.x + gap
      } else {
        // Vertical column layout
        const x = 0
        const y = currentOffset + chip.size.y / 2

        chipPlacements[chip.chipId] = {
          x,
          y,
          ccwRotationDegrees: rotation,
        }

        currentOffset += chip.size.y + gap
      }
    }

    // Center the entire layout around (0, 0)
    const layoutBounds = this.calculateLayoutBounds(chipPlacements, chips)
    const centerX = (layoutBounds.minX + layoutBounds.maxX) / 2
    const centerY = (layoutBounds.minY + layoutBounds.maxY) / 2

    for (const chipId of Object.keys(chipPlacements)) {
      chipPlacements[chipId]!.x -= centerX
      chipPlacements[chipId]!.y -= centerY
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  /**
   * Calculate the bounding box of the current layout
   */
  private calculateLayoutBounds(
    chipPlacements: Record<string, Placement>,
    chips: any[],
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const chip of chips) {
      const placement = chipPlacements[chip.chipId]
      if (!placement) continue

      const halfWidth = chip.size.x / 2
      const halfHeight = chip.size.y / 2

      minX = Math.min(minX, placement.x - halfWidth)
      maxX = Math.max(maxX, placement.x + halfWidth)
      minY = Math.min(minY, placement.y - halfHeight)
      maxY = Math.max(maxY, placement.y + halfHeight)
    }

    return { minX, maxX, minY, maxY }
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
