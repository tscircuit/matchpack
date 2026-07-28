import {
  doBoundsOverlap,
  getBoundFromCenteredRect,
  getBoundsCenter,
  getBoundsFromPoints,
  type Bounds,
} from "@tscircuit/math-utils"
import type { GraphicsObject } from "graphics-debug"
import { applyToPoint, translate } from "transformation-matrix"
import type {
  ChipPin,
  ChipId,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { Side } from "../../types/Side"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import { DIRECT_PASSIVE_VERTICAL_OFFSET } from "../PackInnerPartitionsSolver/offsetSingleDirectPassiveBelowPin"

type SolverOptions = {
  inputProblem: InputProblem
  packedPartitions: PackedPartition[]
  inputLayout: OutputLayout
}

const getChipBounds = (
  chipId: ChipId,
  {
    inputProblem,
    layout,
  }: { inputProblem: InputProblem; layout: OutputLayout },
): Bounds | null => {
  const placement = layout.chipPlacements[chipId]
  const chip = inputProblem.chipMap[chipId]
  if (!placement || !chip) return null
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })
}

const getPartitionBounds = (
  chipIds: ChipId[],
  context: { inputProblem: InputProblem; layout: OutputLayout },
): Bounds | null => {
  const corners = chipIds.flatMap((chipId) => {
    const bounds = getChipBounds(chipId, context)
    if (!bounds) return []
    return [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    ]
  })
  return getBoundsFromPoints(corners)
}

const getDirectMainPin = (
  {
    mainPartition,
    mainChipId,
    side,
  }: {
    mainPartition: PackedPartition
    mainChipId: ChipId
    side: Side
  },
  context: {
    inputProblem: InputProblem
    connectedPinsByPinId: Record<PinId, ChipPin[]>
  },
): ChipPin | null => {
  const mainChip = context.inputProblem.chipMap[mainChipId]
  if (!mainChip) return null
  const partitionPinIds = new Set(
    Object.keys(mainPartition.inputProblem.chipPinMap),
  )
  for (const pinId of mainChip.pins) {
    const mainPin = context.inputProblem.chipPinMap[pinId]
    if (!mainPin || mainPin.side !== side) continue
    const hasDirectNeighbor = (context.connectedPinsByPinId[pinId] ?? []).some(
      (connectedPin) =>
        partitionPinIds.has(connectedPin.pinId) &&
        !mainChip.pins.includes(connectedPin.pinId),
    )
    if (hasDirectNeighbor) return mainPin
  }
  return null
}

const partitionsHaveDirectConnection = (
  {
    partitionA,
    partitionB,
  }: { partitionA: PackedPartition; partitionB: PackedPartition },
  connectedPinsByPinId: Record<PinId, ChipPin[]>,
): boolean => {
  const pinsA = new Set(Object.keys(partitionA.inputProblem.chipPinMap))
  const pinsB = new Set(Object.keys(partitionB.inputProblem.chipPinMap))
  return [...pinsA].some((pinId) =>
    (connectedPinsByPinId[pinId] ?? []).some((connectedPin) =>
      pinsB.has(connectedPin.pinId),
    ),
  )
}

const movedChipsOverlap = (
  movedChipIds: ChipId[],
  context: { inputProblem: InputProblem; layout: OutputLayout },
): boolean => {
  const movedChipIdSet = new Set(movedChipIds)
  return movedChipIds.some((movedChipId) => {
    const movedBounds = getChipBounds(movedChipId, context)
    return Object.keys(context.layout.chipPlacements).some((chipId) => {
      if (!movedBounds || movedChipIdSet.has(chipId)) return false
      const chipBounds = getChipBounds(chipId, context)
      if (!chipBounds) return false
      return doBoundsOverlap(movedBounds, chipBounds)
    })
  })
}

const getRowOffset = ({
  side,
  chipGap,
  mainBounds,
  rowBounds,
  mainPinPosition,
}: {
  side: Side
  chipGap: number
  mainBounds: Bounds
  rowBounds: Bounds
  mainPinPosition: { x: number; y: number }
}) => {
  const rowCenter = getBoundsCenter(rowBounds)
  const offset = {
    x: mainPinPosition.x - rowCenter.x,
    y: mainPinPosition.y - DIRECT_PASSIVE_VERTICAL_OFFSET - rowCenter.y,
  }
  if (side === "x+") offset.x = mainBounds.maxX + chipGap - rowBounds.minX
  if (side === "x-") offset.x = mainBounds.minX - chipGap - rowBounds.maxX
  if (side === "y+") offset.y = mainBounds.maxY + chipGap - rowBounds.minY
  if (side === "y-") offset.y = mainBounds.minY - chipGap - rowBounds.maxY
  return offset
}

const placeNetOnlyDecouplingRow = (
  {
    layout,
    decouplingPartition,
  }: { layout: OutputLayout; decouplingPartition: PackedPartition },
  { inputProblem, packedPartitions }: SolverOptions,
): void => {
  const partition = decouplingPartition.inputProblem as PartitionInputProblem
  const mainChipId = partition.decouplingMainChipId
  const side = partition.decouplingMainChipSide
  if (partition.partitionType !== "decoupling_caps" || !mainChipId || !side) {
    return
  }

  const connectedPinsByPinId = getPinIdToStronglyConnectedPinsObj(inputProblem)
  const mainPartition = packedPartitions.find(
    (candidate) =>
      candidate !== decouplingPartition &&
      candidate.inputProblem.chipMap[mainChipId],
  )
  if (
    !mainPartition ||
    partitionsHaveDirectConnection(
      { partitionA: decouplingPartition, partitionB: mainPartition },
      connectedPinsByPinId,
    )
  ) {
    return
  }

  const mainPin = getDirectMainPin(
    { mainPartition, mainChipId, side },
    { inputProblem, connectedPinsByPinId },
  )
  const mainChipPlacement = layout.chipPlacements[mainChipId]
  const rowChipIds = Object.keys(partition.chipMap)
  const boundsContext = { inputProblem, layout }
  const mainBounds = getPartitionBounds(
    Object.keys(mainPartition.inputProblem.chipMap),
    boundsContext,
  )
  const rowBounds = getPartitionBounds(rowChipIds, boundsContext)
  if (!mainPin || !mainChipPlacement || !mainBounds || !rowBounds) return
  const rotatedPinOffset = rotatePinOffset(
    mainPin.offset,
    mainChipPlacement.ccwRotationDegrees,
  )
  const mainPinPosition = {
    x: mainChipPlacement.x + rotatedPinOffset.x,
    y: mainChipPlacement.y + rotatedPinOffset.y,
  }

  const offset = getRowOffset({
    side,
    chipGap: inputProblem.chipGap,
    mainBounds,
    rowBounds,
    mainPinPosition,
  })
  const rowToPlacedTransform = translate(offset.x, offset.y)
  const previousPlacements = new Map<ChipId, Placement>()
  for (const chipId of rowChipIds) {
    const placement = layout.chipPlacements[chipId]
    if (!placement) continue
    previousPlacements.set(chipId, placement)
    layout.chipPlacements[chipId] = {
      ...placement,
      ...applyToPoint(rowToPlacedTransform, placement),
    }
  }

  // Reject the row translation when it collides with another partition.
  if (movedChipsOverlap(rowChipIds, boundsContext)) {
    for (const [chipId, placement] of previousPlacements) {
      layout.chipPlacements[chipId] = placement
    }
  }
}

export class PlaceNetOnlyDecouplingRowsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(private options: SolverOptions) {
    super()
  }

  override _step() {
    this.outputLayout = structuredClone(this.options.inputLayout)
    for (const decouplingPartition of this.options.packedPartitions) {
      placeNetOnlyDecouplingRow(
        { layout: this.outputLayout, decouplingPartition },
        this.options,
      )
    }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.options.inputProblem,
      this.outputLayout ?? this.options.inputLayout,
    )
  }

  override getConstructorParams(): [SolverOptions] {
    return [this.options]
  }
}
