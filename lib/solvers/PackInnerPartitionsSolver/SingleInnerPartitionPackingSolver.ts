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

type DecouplingCapLayoutEntry = {
  chipId: ChipId
  chip: Chip
  rotation: 0 | 90 | 180 | 270
  footprintSize: { x: number; y: number }
  preferredMainPin: ChipPin | null
}

const compareNaturalChipIds = (a: ChipId, b: ChipId) => {
  const aParts = a.match(/\d+|\D+/g) ?? [a]
  const bParts = b.match(/\d+|\D+/g) ?? [b]
  const len = Math.min(aParts.length, bParts.length)

  for (let i = 0; i < len; i++) {
    const aPart = aParts[i]!
    const bPart = bParts[i]!
    const aNum = Number(aPart)
    const bNum = Number(bPart)
    const aIsNumber = Number.isInteger(aNum)
    const bIsNumber = Number.isInteger(bNum)

    if (aIsNumber && bIsNumber && aNum !== bNum) {
      return aNum - bNum
    }

    if (aPart !== bPart) return aPart.localeCompare(bPart)
  }

  return aParts.length - bParts.length
}

const getChipIdFromPinId = (pinId: PinId): ChipId =>
  pinId.split(".")[0] ?? pinId

const getPreferredRotation = (chip: Chip): 0 | 90 | 180 | 270 => {
  if (!chip.availableRotations?.length) return 0
  return chip.availableRotations.includes(0) ? 0 : chip.availableRotations[0]!
}

const getAxisForExternalSide = (
  side: ChipPin["side"] | undefined,
): LayoutAxis | null => {
  if (side?.startsWith("x")) return "y"
  if (side?.startsWith("y")) return "x"
  return null
}

const rotatePoint = (
  point: { x: number; y: number },
  degrees: number,
): { x: number; y: number } => {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
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
    const entries: DecouplingCapLayoutEntry[] = Object.entries(
      this.partitionInputProblem.chipMap,
    ).map(([chipId, chip]) => {
      const rotation = getPreferredRotation(chip)
      return {
        chipId,
        chip,
        rotation,
        footprintSize: this.getChipFootprintSize(chip, rotation),
        preferredMainPin: this.getPreferredExternalMainPin(chipId, chip),
      }
    })

    const layoutAxis = this.getDecouplingCapsLayoutAxis(entries)
    entries.sort((a, b) => {
      const aHasMainPin = a.preferredMainPin ? 1 : 0
      const bHasMainPin = b.preferredMainPin ? 1 : 0
      if (aHasMainPin !== bHasMainPin) return bHasMainPin - aHasMainPin

      const aCoordinate = this.getSortCoordinate(a, layoutAxis)
      const bCoordinate = this.getSortCoordinate(b, layoutAxis)
      if (aCoordinate !== bCoordinate) return aCoordinate - bCoordinate

      return compareNaturalChipIds(a.chipId, b.chipId)
    })

    const gap =
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap
    const totalSpan =
      entries.reduce((sum, entry) => sum + entry.footprintSize[layoutAxis], 0) +
      Math.max(0, entries.length - 1) * gap

    const chipPlacements: Record<string, Placement> = {}
    let cursor = -totalSpan / 2

    for (const entry of entries) {
      const span = entry.footprintSize[layoutAxis]
      const center = cursor + span / 2
      chipPlacements[entry.chipId] = {
        x: layoutAxis === "x" ? center : 0,
        y: layoutAxis === "y" ? center : 0,
        ccwRotationDegrees: entry.rotation,
      }
      cursor += span + gap
    }

    this.stats.decouplingCapsLayout = {
      axis: layoutAxis,
      gap,
      order: entries.map((entry) => entry.chipId),
      mainChipId: this.partitionInputProblem.decouplingCapMainChipId ?? null,
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  private getDecouplingCapsLayoutAxis(
    entries: DecouplingCapLayoutEntry[],
  ): LayoutAxis {
    const axisVotes = entries.reduce(
      (votes, entry) => {
        const axis = getAxisForExternalSide(entry.preferredMainPin?.side)
        if (axis) votes[axis] += 1
        return votes
      },
      { x: 0, y: 0 },
    )

    return axisVotes.y > axisVotes.x ? "y" : "x"
  }

  private getSortCoordinate(
    entry: DecouplingCapLayoutEntry,
    fallbackAxis: LayoutAxis,
  ) {
    const mainPin = entry.preferredMainPin
    if (!mainPin) return 0

    const sideAwareAxis = getAxisForExternalSide(mainPin.side) ?? fallbackAxis
    return mainPin.offset[sideAwareAxis]
  }

  private getPreferredExternalMainPin(
    chipId: ChipId,
    chip: Chip,
  ): ChipPin | null {
    const mainChipId = this.partitionInputProblem.decouplingCapMainChipId
    const candidates: Array<{
      capPinId: PinId
      externalPin: ChipPin
      isPositiveVoltage: boolean
      isGround: boolean
    }> = []

    for (const pinId of chip.pins) {
      const externalPins = this.pinIdToStronglyConnectedPins[pinId] ?? []
      for (const externalPin of externalPins) {
        const externalChipId = getChipIdFromPinId(externalPin.pinId)
        if (externalChipId === chipId) continue
        if (mainChipId && externalChipId !== mainChipId) continue

        const netRole = this.getPinNetRole(pinId)
        candidates.push({
          capPinId: pinId,
          externalPin,
          isPositiveVoltage: netRole.isPositiveVoltage,
          isGround: netRole.isGround,
        })
      }
    }

    candidates.sort((a, b) => {
      if (a.isPositiveVoltage !== b.isPositiveVoltage) {
        return a.isPositiveVoltage ? -1 : 1
      }
      if (a.isGround !== b.isGround) return a.isGround ? -1 : 1

      const capPinCompare = a.capPinId.localeCompare(b.capPinId)
      if (capPinCompare !== 0) return capPinCompare

      return a.externalPin.pinId.localeCompare(b.externalPin.pinId)
    })

    return candidates[0]?.externalPin ?? null
  }

  private getPinNetRole(pinId: PinId) {
    const role = {
      isPositiveVoltage: false,
      isGround: false,
    }

    for (const [connKey, isConnected] of Object.entries(
      this.partitionInputProblem.netConnMap,
    )) {
      if (!isConnected) continue

      const [connectedPinId, netId] = connKey.split("-") as [PinId, NetId]
      if (connectedPinId !== pinId) continue

      const net = this.partitionInputProblem.netMap[netId]
      role.isPositiveVoltage ||= Boolean(net?.isPositiveVoltageSource)
      role.isGround ||= Boolean(net?.isGround)
    }

    return role
  }

  private getChipFootprintSize(chip: Chip, rotation: number) {
    const points: Array<{ x: number; y: number }> = [
      { x: -chip.size.x / 2, y: -chip.size.y / 2 },
      { x: -chip.size.x / 2, y: chip.size.y / 2 },
      { x: chip.size.x / 2, y: -chip.size.y / 2 },
      { x: chip.size.x / 2, y: chip.size.y / 2 },
    ]

    for (const pinId of chip.pins) {
      const pin = this.partitionInputProblem.chipPinMap[pinId]
      if (!pin) continue

      points.push(
        { x: pin.offset.x - PIN_SIZE / 2, y: pin.offset.y - PIN_SIZE / 2 },
        { x: pin.offset.x - PIN_SIZE / 2, y: pin.offset.y + PIN_SIZE / 2 },
        { x: pin.offset.x + PIN_SIZE / 2, y: pin.offset.y - PIN_SIZE / 2 },
        { x: pin.offset.x + PIN_SIZE / 2, y: pin.offset.y + PIN_SIZE / 2 },
      )
    }

    const rotatedPoints = points.map((point) => rotatePoint(point, rotation))
    const xs = rotatedPoints.map((point) => point.x)
    const ys = rotatedPoints.map((point) => point.y)

    return {
      x: Math.max(...xs) - Math.min(...xs),
      y: Math.max(...ys) - Math.min(...ys),
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
