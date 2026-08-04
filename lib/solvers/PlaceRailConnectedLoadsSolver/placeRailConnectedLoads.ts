import {
  doBoundsOverlap,
  getBoundFromCenteredRect,
  getBoundsCenter,
  getBoundsFromPoints,
  type Bounds,
} from "@tscircuit/math-utils"
import type {
  ChipId,
  InputProblem,
  NetId,
  PartitionInputProblem,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

export type PlaceRailConnectedLoadsOptions = {
  inputProblem: InputProblem
  packedPartitions: PackedPartition[]
  inputLayout: OutputLayout
}

type PlacementContext = {
  inputProblem: InputProblem
  layout: OutputLayout
}

const getChipBounds = (
  { chipId }: { chipId: ChipId },
  context: PlacementContext,
): Bounds | null => {
  const chip = context.inputProblem.chipMap[chipId]
  const placement = context.layout.chipPlacements[chipId]
  if (!chip || !placement) return null
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })
}

const getPartitionBounds = (
  { chipIds }: { chipIds: ChipId[] },
  context: PlacementContext,
): Bounds | null =>
  getBoundsFromPoints(
    chipIds.flatMap((chipId) => {
      const bounds = getChipBounds({ chipId }, context)
      if (!bounds) return []
      return [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ]
    }),
  )

const getUpperRailPinY = (
  {
    partition,
    railNetIds,
  }: { partition: PackedPartition; railNetIds: Set<NetId> },
  context: PlacementContext,
): number | null => {
  const pinOwnerMap = createPinOwnerMap(partition.inputProblem)
  let upperRailPinY: number | null = null

  for (const pinId of Object.keys(partition.inputProblem.chipPinMap)) {
    const isRailPin = [...railNetIds].some(
      (netId) => context.inputProblem.netConnMap[`${pinId}-${netId}`],
    )
    if (!isRailPin) continue
    const pin = context.inputProblem.chipPinMap[pinId]
    const chip = pinOwnerMap.get(pinId)
    if (!pin || !chip) continue
    const placement = context.layout.chipPlacements[chip.chipId]
    if (!placement) continue
    const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
    const absolutePinY = placement.y + offset.y
    if (upperRailPinY === null || absolutePinY > upperRailPinY) {
      upperRailPinY = absolutePinY
    }
  }

  return upperRailPinY
}

const getRailNetIds = (
  { partition }: { partition: PackedPartition },
  { inputProblem }: PlacementContext,
): Set<NetId> => {
  const railNetIds = new Set<NetId>()
  for (const pinId of Object.keys(partition.inputProblem.chipPinMap)) {
    for (const [netId, net] of Object.entries(inputProblem.netMap)) {
      if (!net.isGround && !net.isPositiveVoltageSource) continue
      if (inputProblem.netConnMap[`${pinId}-${netId}`]) railNetIds.add(netId)
    }
  }
  return railNetIds
}

const isTwoPinLoadPartition = (partition: PackedPartition): boolean => {
  const chips = Object.values(partition.inputProblem.chipMap)
  return (
    chips.length > 1 &&
    chips.every(
      (chip) =>
        chip.pins.length === 2 && !chip.isCapacitor && !chip.fixedPosition,
    )
  )
}

const haveSameRails = (railA: Set<NetId>, railB: Set<NetId>): boolean =>
  railA.size >= 2 &&
  railA.size === railB.size &&
  [...railA].every((netId) => railB.has(netId))

const movePartition = (
  { chipIds, offset }: { chipIds: ChipId[]; offset: { x: number; y: number } },
  { layout }: PlacementContext,
): Map<ChipId, Placement> => {
  const previousPlacements = new Map<ChipId, Placement>()
  for (const chipId of chipIds) {
    const placement = layout.chipPlacements[chipId]
    if (!placement) continue
    previousPlacements.set(chipId, placement)
    layout.chipPlacements[chipId] = {
      ...placement,
      x: placement.x + offset.x,
      y: placement.y + offset.y,
    }
  }
  return previousPlacements
}

const movedPartitionOverlaps = (
  { movedChipIds }: { movedChipIds: ChipId[] },
  context: PlacementContext,
): boolean => {
  const movedChipIdSet = new Set(movedChipIds)
  return movedChipIds.some((movedChipId) => {
    const movedBounds = getChipBounds({ chipId: movedChipId }, context)
    if (!movedBounds) return false
    return Object.keys(context.layout.chipPlacements).some((chipId) => {
      if (movedChipIdSet.has(chipId)) return false
      const bounds = getChipBounds({ chipId }, context)
      if (!bounds) return false
      return doBoundsOverlap(movedBounds, bounds)
    })
  })
}

export const placeRailConnectedLoads = (
  options: PlaceRailConnectedLoadsOptions,
): OutputLayout => {
  const { inputProblem, packedPartitions } = options
  const layout = structuredClone(options.inputLayout)
  const context = { inputProblem, layout }
  const capacitorPartitions = packedPartitions.filter(
    (partition) =>
      (partition.inputProblem as PartitionInputProblem).partitionType ===
      "decoupling_caps",
  )
  const loadPartitions = packedPartitions.filter(isTwoPinLoadPartition)
  const placedLoadPartitions = new Set<PackedPartition>()

  for (const capacitorPartition of capacitorPartitions) {
    const capacitorRails = getRailNetIds(
      { partition: capacitorPartition },
      context,
    )
    const capacitorChipIds = Object.keys(
      capacitorPartition.inputProblem.chipMap,
    )
    const initialCapacitorBounds = getPartitionBounds(
      { chipIds: capacitorChipIds },
      context,
    )
    if (!initialCapacitorBounds) continue
    let capacitorRowY = getBoundsCenter(initialCapacitorBounds).y
    const upperCapacitorRailPinY = getUpperRailPinY(
      { partition: capacitorPartition, railNetIds: capacitorRails },
      context,
    )
    if (upperCapacitorRailPinY !== null) {
      capacitorRowY = upperCapacitorRailPinY
    }
    let rowRightEdge = initialCapacitorBounds.maxX

    for (const loadPartition of loadPartitions) {
      if (placedLoadPartitions.has(loadPartition)) continue
      const loadRails = getRailNetIds({ partition: loadPartition }, context)
      if (!haveSameRails(capacitorRails, loadRails)) continue

      const loadChipIds = Object.keys(loadPartition.inputProblem.chipMap)
      const loadBounds = getPartitionBounds({ chipIds: loadChipIds }, context)
      if (!loadBounds) continue

      // Capacitors anchor the row; rail-connected loads follow on its right.
      let loadAlignmentY = getBoundsCenter(loadBounds).y
      const upperLoadRailPinY = getUpperRailPinY(
        { partition: loadPartition, railNetIds: loadRails },
        context,
      )
      if (upperLoadRailPinY !== null) loadAlignmentY = upperLoadRailPinY
      const previousPlacements = movePartition(
        {
          chipIds: loadChipIds,
          offset: {
            x: rowRightEdge + inputProblem.partitionGap - loadBounds.minX,
            y: capacitorRowY - loadAlignmentY,
          },
        },
        context,
      )

      if (movedPartitionOverlaps({ movedChipIds: loadChipIds }, context)) {
        for (const [chipId, placement] of previousPlacements) {
          layout.chipPlacements[chipId] = placement
        }
        continue
      }

      const placedBounds = getPartitionBounds({ chipIds: loadChipIds }, context)
      if (placedBounds) rowRightEdge = placedBounds.maxX
      placedLoadPartitions.add(loadPartition)
    }
  }

  return layout
}
