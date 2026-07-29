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
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
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
    const neighbor = Object.values(mainPartition.inputProblem.chipMap).find(
      (chip) => chip.chipId !== mainChipId && chip.pins.includes(neighborPin),
    )
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
  gap,
  mainBounds,
  rowBounds,
  mainAnchor,
  rowAnchor,
}: {
  side: Side
  gap: number
  mainBounds: Bounds
  rowBounds: Bounds
  mainAnchor: { x: number; y: number }
  rowAnchor: { x: number; y: number }
}) => {
  const offset = {
    x: mainAnchor.x - rowAnchor.x,
    y: mainAnchor.y - rowAnchor.y,
  }
  if (side === "x+") offset.x = mainBounds.maxX + gap - rowBounds.minX
  if (side === "x-") offset.x = mainBounds.minX - gap - rowBounds.maxX
  if (side === "y+") offset.y = mainBounds.maxY + gap - rowBounds.minY
  if (side === "y-") offset.y = mainBounds.minY - gap - rowBounds.maxY
  return offset
}

const getNetIdsForPin = (
  pinId: PinId,
  inputProblem: InputProblem,
): Set<string> => {
  const netIds = new Set<string>()
  for (const [connection, connected] of Object.entries(
    inputProblem.netConnMap,
  )) {
    if (!connected) continue
    const [connectedPinId, netId] = connection.split("-")
    if (connectedPinId === pinId && netId) netIds.add(netId)
  }
  return netIds
}

const getAbsolutePinPosition = (
  pinId: PinId,
  inputProblem: InputProblem,
  layout: OutputLayout,
): { x: number; y: number } | null => {
  const chip = Object.values(inputProblem.chipMap).find((candidate) =>
    candidate.pins.includes(pinId),
  )
  const pin = inputProblem.chipPinMap[pinId]
  const placement = chip && layout.chipPlacements[chip.chipId]
  if (!pin || !placement) return null
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return { x: placement.x + offset.x, y: placement.y + offset.y }
}

const averagePoints = (
  points: Array<{ x: number; y: number }>,
): { x: number; y: number } | null => {
  if (points.length === 0) return null
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

const getSharedNetAnchors = ({
  mainChipId,
  side,
  rowChipIds,
  inputProblem,
  layout,
}: {
  mainChipId: ChipId
  side: Side
  rowChipIds: ChipId[]
  inputProblem: InputProblem
  layout: OutputLayout
}): {
  mainAnchor: { x: number; y: number }
  rowAnchor: { x: number; y: number }
} | null => {
  const mainChip = inputProblem.chipMap[mainChipId]
  if (!mainChip) return null
  const rowPins = rowChipIds.flatMap(
    (chipId) => inputProblem.chipMap[chipId]?.pins ?? [],
  )
  const rowNetIds = new Set(
    rowPins.flatMap((pinId) => [...getNetIdsForPin(pinId, inputProblem)]),
  )
  const sharedNetIds = new Set(
    mainChip.pins
      .flatMap((pinId) => [...getNetIdsForPin(pinId, inputProblem)])
      .filter((netId) => rowNetIds.has(netId)),
  )
  const nonGroundNetIds = new Set(
    [...sharedNetIds].filter((netId) => !inputProblem.netMap[netId]?.isGround),
  )
  const relevantNetIds =
    nonGroundNetIds.size > 0 ? nonGroundNetIds : sharedNetIds
  const usesRelevantNet = (pinId: PinId) =>
    [...getNetIdsForPin(pinId, inputProblem)].some((netId) =>
      relevantNetIds.has(netId),
    )

  const mainAnchor = averagePoints(
    mainChip.pins
      .filter(
        (pinId) =>
          inputProblem.chipPinMap[pinId]?.side === side &&
          usesRelevantNet(pinId),
      )
      .flatMap((pinId) => {
        const point = getAbsolutePinPosition(pinId, inputProblem, layout)
        return point ? [point] : []
      }),
  )
  const rowAnchor = averagePoints(
    rowPins.filter(usesRelevantNet).flatMap((pinId) => {
      const point = getAbsolutePinPosition(pinId, inputProblem, layout)
      return point ? [point] : []
    }),
  )
  return mainAnchor && rowAnchor ? { mainAnchor, rowAnchor } : null
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
  const neighbor = neighborId && layout.chipPlacements[neighborId]
  const rowChipIds = Object.keys(partition.chipMap)
  const boundsContext = { inputProblem, layout }
  const mainBounds = getPartitionBounds(
    Object.keys(mainPartition.inputProblem.chipMap),
    boundsContext,
  )
  const rowBounds = getPartitionBounds(rowChipIds, boundsContext)
  if (!mainBounds || !rowBounds) return

  const anchors = neighbor
    ? { mainAnchor: neighbor, rowAnchor: getBoundsCenter(rowBounds) }
    : getSharedNetAnchors({
        mainChipId,
        side,
        rowChipIds,
        inputProblem,
        layout,
      })
  if (!anchors) return

  const offset = getRowOffset({
    side,
    gap: inputProblem.decouplingCapsGap ?? inputProblem.chipGap,
    mainBounds,
    rowBounds,
    ...anchors,
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
