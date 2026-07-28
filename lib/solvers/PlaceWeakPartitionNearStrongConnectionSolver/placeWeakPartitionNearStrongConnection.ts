import type {
  ChipId,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { Side } from "../../types/Side"
import { getRotatedSize } from "../../utils/rotatePinOffset"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

type Bounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const getChipBounds = (
  inputProblem: InputProblem,
  chipId: ChipId,
  placement: Placement,
): Bounds => {
  const size = getRotatedSize(
    inputProblem.chipMap[chipId]!.size,
    placement.ccwRotationDegrees,
  )
  return {
    minX: placement.x - size.x / 2,
    maxX: placement.x + size.x / 2,
    minY: placement.y - size.y / 2,
    maxY: placement.y + size.y / 2,
  }
}

const getPartitionBounds = (
  inputProblem: InputProblem,
  layout: OutputLayout,
  chipIds: ChipId[],
): Bounds | null => {
  let bounds: Bounds | null = null

  for (const chipId of chipIds) {
    const placement = layout.chipPlacements[chipId]
    if (!placement) continue
    const chipBounds = getChipBounds(inputProblem, chipId, placement)

    if (!bounds) {
      bounds = { ...chipBounds }
      continue
    }
    bounds.minX = Math.min(bounds.minX, chipBounds.minX)
    bounds.maxX = Math.max(bounds.maxX, chipBounds.maxX)
    bounds.minY = Math.min(bounds.minY, chipBounds.minY)
    bounds.maxY = Math.max(bounds.maxY, chipBounds.maxY)
  }

  return bounds
}

const findStrongNeighborOnSide = (
  inputProblem: InputProblem,
  mainPartition: PackedPartition,
  mainChipId: ChipId,
  side: Side,
): ChipId | null => {
  const mainChip = inputProblem.chipMap[mainChipId]
  if (!mainChip) return null

  const sidePinIds = new Set(
    mainChip.pins.filter(
      (pinId) => inputProblem.chipPinMap[pinId]?.side === side,
    ),
  )

  for (const [connectionKey, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [pinA, pinB] = connectionKey.split("-") as [PinId, PinId]

    let neighborPinId: PinId | null = null
    if (sidePinIds.has(pinA)) neighborPinId = pinB
    if (sidePinIds.has(pinB)) neighborPinId = pinA
    if (!neighborPinId) continue

    for (const chip of Object.values(mainPartition.inputProblem.chipMap)) {
      if (chip.chipId === mainChipId) continue
      if (chip.pins.includes(neighborPinId)) return chip.chipId
    }
  }

  return null
}

const hasStrongConnectionBetweenPartitions = (
  inputProblem: InputProblem,
  partitionA: PackedPartition,
  partitionB: PackedPartition,
): boolean => {
  const partitionAPinIds = new Set(
    Object.keys(partitionA.inputProblem.chipPinMap),
  )
  const partitionBPinIds = new Set(
    Object.keys(partitionB.inputProblem.chipPinMap),
  )

  for (const [connectionKey, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [pinA, pinB] = connectionKey.split("-") as [PinId, PinId]
    const connectsAcrossPartitions =
      (partitionAPinIds.has(pinA) && partitionBPinIds.has(pinB)) ||
      (partitionAPinIds.has(pinB) && partitionBPinIds.has(pinA))
    if (connectsAcrossPartitions) return true
  }

  return false
}

const movedPartitionOverlaps = (
  inputProblem: InputProblem,
  layout: OutputLayout,
  movedChipIds: ChipId[],
): boolean => {
  const movedChipIdSet = new Set(movedChipIds)

  for (const movedChipId of movedChipIds) {
    const movedPlacement = layout.chipPlacements[movedChipId]
    if (!movedPlacement) continue
    const movedBounds = getChipBounds(inputProblem, movedChipId, movedPlacement)

    for (const [chipId, placement] of Object.entries(layout.chipPlacements)) {
      if (movedChipIdSet.has(chipId)) continue
      const bounds = getChipBounds(inputProblem, chipId, placement)
      const overlapsX =
        movedBounds.minX < bounds.maxX && movedBounds.maxX > bounds.minX
      const overlapsY =
        movedBounds.minY < bounds.maxY && movedBounds.maxY > bounds.minY
      if (overlapsX && overlapsY) return true
    }
  }

  return false
}

export const placeWeakPartitionsNearStrongConnections = ({
  inputProblem,
  packedPartitions,
  inputLayout,
}: {
  inputProblem: InputProblem
  packedPartitions: PackedPartition[]
  inputLayout: OutputLayout
}): OutputLayout => {
  const layout = structuredClone(inputLayout)

  for (const packedPartition of packedPartitions) {
    const weakPartition = packedPartition.inputProblem as PartitionInputProblem
    const mainChipId = weakPartition.decouplingMainChipId
    const side = weakPartition.decouplingMainChipSide
    if (
      weakPartition.partitionType !== "decoupling_caps" ||
      !mainChipId ||
      !side
    ) {
      continue
    }

    const mainPartition = packedPartitions.find(
      (partition) =>
        partition !== packedPartition &&
        partition.inputProblem.chipMap[mainChipId],
    )
    if (!mainPartition) continue

    // Only net-connected partitions follow a component already attached by pin.
    if (
      hasStrongConnectionBetweenPartitions(
        inputProblem,
        packedPartition,
        mainPartition,
      )
    ) {
      continue
    }

    const strongNeighborChipId = findStrongNeighborOnSide(
      inputProblem,
      mainPartition,
      mainChipId,
      side,
    )
    if (!strongNeighborChipId) continue

    const weakChipIds = Object.keys(weakPartition.chipMap)
    const mainChipIds = Object.keys(mainPartition.inputProblem.chipMap)
    const mainBounds = getPartitionBounds(inputProblem, layout, mainChipIds)
    const weakBounds = getPartitionBounds(inputProblem, layout, weakChipIds)
    if (!mainBounds || !weakBounds) continue

    const strongNeighborPlacement = layout.chipPlacements[strongNeighborChipId]
    if (!strongNeighborPlacement) continue

    const offset = {
      x: strongNeighborPlacement.x - (weakBounds.minX + weakBounds.maxX) / 2,
      y: strongNeighborPlacement.y - (weakBounds.minY + weakBounds.maxY) / 2,
    }
    if (side === "x+") {
      offset.x = mainBounds.maxX + inputProblem.chipGap - weakBounds.minX
    } else if (side === "x-") {
      offset.x = mainBounds.minX - inputProblem.chipGap - weakBounds.maxX
    } else if (side === "y+") {
      offset.y = mainBounds.maxY + inputProblem.chipGap - weakBounds.minY
    } else {
      offset.y = mainBounds.minY - inputProblem.chipGap - weakBounds.maxY
    }

    const previousPlacements = new Map<ChipId, Placement>()
    for (const chipId of weakChipIds) {
      const placement = layout.chipPlacements[chipId]
      if (!placement) continue
      previousPlacements.set(chipId, placement)
      layout.chipPlacements[chipId] = {
        ...placement,
        x: placement.x + offset.x,
        y: placement.y + offset.y,
      }
    }

    if (movedPartitionOverlaps(inputProblem, layout, weakChipIds)) {
      for (const [chipId, placement] of previousPlacements) {
        layout.chipPlacements[chipId] = placement
      }
    }
  }

  return layout
}
