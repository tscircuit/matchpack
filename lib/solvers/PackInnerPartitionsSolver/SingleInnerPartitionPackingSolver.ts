/**
 * Packs components within a single partition to create an optimal internal layout.
 * Uses a packing algorithm to arrange chips and their connections within the partition.
 */

import { type PackInput, PackSolver2 } from "calculate-packing"
import type { GraphicsObject } from "graphics-debug"
import type {
  ChipId,
  ChipPin,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"
import { BaseSolver } from "../BaseSolver"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { getPadsBoundingBox } from "./getPadsBoundingBox"

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

  private createDecouplingCapsLayout(): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}
    const gap =
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap
    const chipIds = Object.keys(this.partitionInputProblem.chipMap).sort(
      compareNaturalIds,
    )

    let cursorX = 0
    let rowMinX = Infinity
    let rowMaxX = -Infinity
    const placed: Array<{
      chipId: ChipId
      x: number
      y: number
      ccwRotationDegrees: Placement["ccwRotationDegrees"]
    }> = []

    for (const chipId of chipIds) {
      const chip = this.partitionInputProblem.chipMap[chipId]!
      const ccwRotationDegrees = getPreferredDecouplingCapRotation(
        chip.availableRotations,
      )
      const bounds = getChipEnvelopeBounds({
        chipId,
        chip,
        chipPinMap: this.partitionInputProblem.chipPinMap,
        ccwRotationDegrees,
      })

      const x = placed.length === 0 ? -bounds.minX : cursorX - bounds.minX
      const minX = x + bounds.minX
      const maxX = x + bounds.maxX
      rowMinX = Math.min(rowMinX, minX)
      rowMaxX = Math.max(rowMaxX, maxX)
      cursorX = maxX + gap
      placed.push({ chipId, x, y: 0, ccwRotationDegrees })
    }

    if (placed.length === 0) {
      return { chipPlacements, groupPlacements: {} }
    }

    const rowCenterX = (rowMinX + rowMaxX) / 2
    for (const placement of placed) {
      chipPlacements[placement.chipId] = {
        x: placement.x - rowCenterX,
        y: placement.y,
        ccwRotationDegrees: placement.ccwRotationDegrees,
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

type Bounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const compareNaturalIds = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

const getPreferredDecouplingCapRotation = (
  availableRotations?: Array<0 | 90 | 180 | 270>,
): Placement["ccwRotationDegrees"] => {
  if (!availableRotations || availableRotations.length === 0) return 0
  if (availableRotations.includes(0)) return 0
  if (availableRotations.includes(180)) return 180
  return availableRotations[0] ?? 0
}

const getChipEnvelopeBounds = ({
  chipId,
  chip,
  chipPinMap,
  ccwRotationDegrees,
}: {
  chipId: ChipId
  chip: InputProblem["chipMap"][ChipId]
  chipPinMap: InputProblem["chipPinMap"]
  ccwRotationDegrees: Placement["ccwRotationDegrees"]
}): Bounds => {
  const halfBodySize = rotateSize(chip.size, ccwRotationDegrees)
  const bounds = {
    minX: -halfBodySize.x / 2,
    maxX: halfBodySize.x / 2,
    minY: -halfBodySize.y / 2,
    maxY: halfBodySize.y / 2,
  }

  for (const pinId of chip.pins) {
    const pin = chipPinMap[pinId]
    if (!pin) continue
    const offset = rotatePoint(pin.offset, ccwRotationDegrees)
    bounds.minX = Math.min(bounds.minX, offset.x - PIN_SIZE / 2)
    bounds.maxX = Math.max(bounds.maxX, offset.x + PIN_SIZE / 2)
    bounds.minY = Math.min(bounds.minY, offset.y - PIN_SIZE / 2)
    bounds.maxY = Math.max(bounds.maxY, offset.y + PIN_SIZE / 2)
  }

  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxY)
  ) {
    throw new Error(`Invalid envelope bounds for ${chipId}`)
  }

  return bounds
}

const rotateSize = (
  size: { x: number; y: number },
  ccwRotationDegrees: Placement["ccwRotationDegrees"],
) => {
  if (ccwRotationDegrees === 90 || ccwRotationDegrees === 270) {
    return { x: size.y, y: size.x }
  }
  return size
}

const rotatePoint = (
  point: { x: number; y: number },
  ccwRotationDegrees: Placement["ccwRotationDegrees"],
) => {
  if (ccwRotationDegrees === 90) {
    return { x: -point.y, y: point.x }
  }
  if (ccwRotationDegrees === 180) {
    return { x: -point.x, y: -point.y }
  }
  if (ccwRotationDegrees === 270) {
    return { x: point.y, y: -point.x }
  }
  return point
}
