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
  ChipId,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { Side } from "../../types/Side"
import { getRotatedSize } from "../../utils/rotatePinOffset"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

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

const getDirectNeighbor = (
  {
    mainPartition,
    mainChipId,
    side,
  }: {
    mainPartition: PackedPartition
    mainChipId: ChipId
    side: Side
  },
  inputProblem: InputProblem,
): ChipId | null => {
  const sidePins = new Set(
    inputProblem.chipMap[mainChipId]?.pins.filter(
      (pinId) => inputProblem.chipPinMap[pinId]?.side === side,
    ),
  )
  const pinOwnerMap = createPinOwnerMap(mainPartition.inputProblem)
  for (const [connection, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [pinA, pinB] = connection.split("-") as [PinId, PinId]
    const neighborPin = sidePins.has(pinA)
      ? pinB
      : sidePins.has(pinB)
        ? pinA
        : null
    if (!neighborPin) continue
    const neighbor = pinOwnerMap.get(neighborPin)
    if (neighbor?.chipId === mainChipId) continue
    if (neighbor) return neighbor.chipId
  }
  return null
}

const partitionsHaveDirectConnection = (
  {
    partitionA,
    partitionB,
  }: { partitionA: PackedPartition; partitionB: PackedPartition },
  inputProblem: InputProblem,
): boolean => {
  const pinsA = new Set(Object.keys(partitionA.inputProblem.chipPinMap))
  const pinsB = new Set(Object.keys(partitionB.inputProblem.chipPinMap))
  return Object.entries(inputProblem.pinStrongConnMap).some(
    ([connection, connected]) => {
      if (!connected) return false
      const [pinA, pinB] = connection.split("-")
      return (
        (pinsA.has(pinA!) && pinsB.has(pinB!)) ||
        (pinsA.has(pinB!) && pinsB.has(pinA!))
      )
    },
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
      return chipBounds ? doBoundsOverlap(movedBounds, chipBounds) : false
    })
  })
}

const getRowOffset = ({
  side,
  chipGap,
  mainBounds,
  rowBounds,
  neighbor,
}: {
  side: Side
  chipGap: number
  mainBounds: Bounds
  rowBounds: Bounds
  neighbor: Placement
}) => {
  const rowCenter = getBoundsCenter(rowBounds)
  const offset = {
    x: neighbor.x - rowCenter.x,
    y: neighbor.y - rowCenter.y,
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

  const mainPartition = packedPartitions.find(
    (candidate) =>
      candidate !== decouplingPartition &&
      candidate.inputProblem.chipMap[mainChipId],
  )
  if (
    !mainPartition ||
    partitionsHaveDirectConnection(
      { partitionA: decouplingPartition, partitionB: mainPartition },
      inputProblem,
    )
  ) {
    return
  }

  const neighborId = getDirectNeighbor(
    { mainPartition, mainChipId, side },
    inputProblem,
  )
  const neighbor =
    (neighborId && layout.chipPlacements[neighborId]) ??
    layout.chipPlacements[mainChipId]
  const rowChipIds = Object.keys(partition.chipMap)
  const boundsContext = { inputProblem, layout }
  const mainBounds = getPartitionBounds(
    Object.keys(mainPartition.inputProblem.chipMap),
    boundsContext,
  )
  const rowBounds = getPartitionBounds(rowChipIds, boundsContext)
  if (!neighbor || !mainBounds || !rowBounds) return

  const offset = getRowOffset({
    side,
    chipGap: inputProblem.chipGap,
    mainBounds,
    rowBounds,
    neighbor,
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
