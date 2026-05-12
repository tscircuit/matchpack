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
  Chip,
  ChipPin,
  PartitionInputProblem,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"
import { getPadsBoundingBox } from "./getPadsBoundingBox"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

const PIN_SIZE = 0.1

type LayoutAxis = "x" | "y"

const compareNaturalChipIds = (a: ChipId, b: ChipId) => {
  const aParts = a.match(/\d+|\D+/g) ?? [a]
  const bParts = b.match(/\d+|\D+/g) ?? [b]
  const partCount = Math.min(aParts.length, bParts.length)

  for (let i = 0; i < partCount; i++) {
    const aPart = aParts[i]!
    const bPart = bParts[i]!
    const aNumber = Number(aPart)
    const bNumber = Number(bPart)
    const aIsNumber = Number.isInteger(aNumber)
    const bIsNumber = Number.isInteger(bNumber)

    if (aIsNumber && bIsNumber && aNumber !== bNumber) {
      return aNumber - bNumber
    }

    if (aPart !== bPart) {
      return aPart.localeCompare(bPart)
    }
  }

  return aParts.length - bParts.length
}

const getChipIdFromPinId = (pinId: PinId): ChipId =>
  pinId.split(".")[0] ?? pinId

const getPreferredRotation = (chip: Chip): 0 | 90 | 180 | 270 => {
  if (!chip.availableRotations?.length) return 0
  return chip.availableRotations.includes(0) ? 0 : chip.availableRotations[0]!
}

const getRotatedSize = (chip: Chip, rotation: number) => {
  if (rotation === 90 || rotation === 270) {
    return { x: chip.size.y, y: chip.size.x }
  }
  return chip.size
}

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

  private createDecouplingCapsLayout(): OutputLayout {
    const entries = Object.entries(this.partitionInputProblem.chipMap).map(
      ([chipId, chip]) => {
        const connectedMainPin = this.getStronglyConnectedExternalPin(
          chipId,
          chip,
        )
        const rotation = getPreferredRotation(chip)
        const rotatedSize = getRotatedSize(chip, rotation)

        return {
          chipId,
          connectedMainPin,
          rotation,
          rotatedSize,
        }
      },
    )

    const externalPinSideCounts = entries.reduce(
      (counts, entry) => {
        if (entry.connectedMainPin?.side.startsWith("x")) counts.x += 1
        if (entry.connectedMainPin?.side.startsWith("y")) counts.y += 1
        return counts
      },
      { x: 0, y: 0 },
    )
    const layoutAxis: LayoutAxis =
      externalPinSideCounts.x > externalPinSideCounts.y ? "y" : "x"

    entries.sort((a, b) => {
      const aHasMainPin = a.connectedMainPin ? 1 : 0
      const bHasMainPin = b.connectedMainPin ? 1 : 0
      if (aHasMainPin !== bHasMainPin) return bHasMainPin - aHasMainPin

      const aCoordinate =
        layoutAxis === "x"
          ? (a.connectedMainPin?.offset.x ?? 0)
          : (a.connectedMainPin?.offset.y ?? 0)
      const bCoordinate =
        layoutAxis === "x"
          ? (b.connectedMainPin?.offset.x ?? 0)
          : (b.connectedMainPin?.offset.y ?? 0)

      if (aCoordinate !== bCoordinate) return aCoordinate - bCoordinate
      return compareNaturalChipIds(a.chipId, b.chipId)
    })

    const gap =
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap
    const totalSpan =
      entries.reduce((sum, entry) => {
        return sum + entry.rotatedSize[layoutAxis]
      }, 0) +
      Math.max(0, entries.length - 1) * gap
    const chipPlacements: Record<string, Placement> = {}
    let cursor = -totalSpan / 2

    for (const entry of entries) {
      const span = entry.rotatedSize[layoutAxis]
      const center = cursor + span / 2

      chipPlacements[entry.chipId] = {
        x: layoutAxis === "x" ? center : 0,
        y: layoutAxis === "y" ? center : 0,
        ccwRotationDegrees: entry.rotation,
      }

      cursor += span + gap
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  private getStronglyConnectedExternalPin(
    chipId: ChipId,
    chip: Chip,
  ): ChipPin | null {
    for (const pinId of chip.pins) {
      for (const connectedPin of this.pinIdToStronglyConnectedPins[pinId] ??
        []) {
        if (getChipIdFromPinId(connectedPin.pinId) !== chipId) {
          return connectedPin
        }
      }
    }

    return null
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
