import {
  doBoundsOverlap,
  getBoundFromCenteredRect,
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
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import type { GroundedLoadPair } from "../GroundedLoadPairSolver/getGroundedLoadPairs"
import {
  getRailConnectedLoadGroups,
  type RailConnectedLoadGroup,
} from "./getRailConnectedLoadGroups"

export type PlaceRailConnectedLoadsOptions = {
  inputProblem: InputProblem
  groundedLoadPairs: GroundedLoadPair[]
  packedPartitions: PackedPartition[]
  inputLayout: OutputLayout
}

type PlacementContext = {
  inputProblem: InputProblem
  layout: OutputLayout
}

// Bounds must use the placed rotation so collision checks match the snapshot.
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

// The upper rail pin is the visual continuation point for a horizontal row.
const getUpperRailPin = (
  { chipIds, railNetIds }: { chipIds: ChipId[]; railNetIds: Set<NetId> },
  context: PlacementContext,
): { chipId: ChipId; y: number } | null => {
  let upperRailPin: { chipId: ChipId; y: number } | null = null

  for (const chipId of chipIds) {
    const chip = context.inputProblem.chipMap[chipId]
    if (!chip) continue
    const placement = context.layout.chipPlacements[chip.chipId]
    if (!placement) continue

    for (const pinId of chip.pins) {
      const isRailPin = [...railNetIds].some(
        (netId) => context.inputProblem.netConnMap[`${pinId}-${netId}`],
      )
      if (!isRailPin) continue
      const pin = context.inputProblem.chipPinMap[pinId]
      if (!pin) continue
      const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
      const pinY = placement.y + offset.y
      if (upperRailPin === null || pinY > upperRailPin.y) {
        upperRailPin = { chipId: chip.chipId, y: pinY }
      }
    }
  }

  return upperRailPin
}

const getRailNetIds = (
  { chipIds }: { chipIds: ChipId[] },
  { inputProblem }: PlacementContext,
): Set<NetId> => {
  const railNetIds = new Set<NetId>()
  for (const chipId of chipIds) {
    const chip = inputProblem.chipMap[chipId]
    if (!chip) continue
    for (const pinId of chip.pins) {
      for (const [netId, net] of Object.entries(inputProblem.netMap)) {
        if (!net.isGround && !net.isPositiveVoltageSource) continue
        if (inputProblem.netConnMap[`${pinId}-${netId}`]) railNetIds.add(netId)
      }
    }
  }
  return railNetIds
}

const haveSameRails = (railA: Set<NetId>, railB: Set<NetId>): boolean =>
  railA.size >= 2 &&
  railA.size === railB.size &&
  [...railA].every((netId) => railB.has(netId))

const movePartition = (
  { chipIds, offset }: { chipIds: ChipId[]; offset: { x: number; y: number } },
  { layout }: PlacementContext,
): Map<ChipId, Placement> => {
  // Save every placement so a rejected rigid translation can be rolled back.
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
  // Internal contacts are allowed; only chips outside the partition can block it.
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
  const { groundedLoadPairs, inputProblem, packedPartitions } = options
  const layout = structuredClone(options.inputLayout)
  const context = { inputProblem, layout }
  const capacitorPartitions = packedPartitions.filter(
    (partition) =>
      (partition.inputProblem as PartitionInputProblem).partitionType ===
      "decoupling_caps",
  )
  const loadGroups = getRailConnectedLoadGroups({
    groundedLoadPairs,
    packedPartitions,
  })
  const placedLoadGroups = new Set<RailConnectedLoadGroup>()

  // Decoupling rows are stable anchors; only matching load partitions move.
  for (const capacitorPartition of capacitorPartitions) {
    const capacitorRails = getRailNetIds(
      { chipIds: Object.keys(capacitorPartition.inputProblem.chipMap) },
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
    const capacitorRailPin = getUpperRailPin(
      { chipIds: capacitorChipIds, railNetIds: capacitorRails },
      context,
    )
    if (!capacitorRailPin) continue
    let rowRightEdge = initialCapacitorBounds.maxX

    for (const loadGroup of loadGroups) {
      if (placedLoadGroups.has(loadGroup)) continue
      const loadRails = getRailNetIds({ chipIds: loadGroup.chipIds }, context)
      if (!haveSameRails(capacitorRails, loadRails)) continue

      const loadChipIds = loadGroup.chipIds
      const loadBounds = getPartitionBounds({ chipIds: loadChipIds }, context)
      if (!loadBounds) continue

      const loadRailPin = getUpperRailPin(
        { chipIds: loadChipIds, railNetIds: loadRails },
        context,
      )
      if (!loadRailPin) continue
      const loadAnchorBounds = getChipBounds(
        { chipId: loadRailPin.chipId },
        context,
      )
      if (!loadAnchorBounds) continue

      // Align the load's upper rail pin with the capacitor row.
      // Every chip receives the same offset, preserving the partition shape.
      const previousPlacements = movePartition(
        {
          chipIds: loadChipIds,
          offset: {
            x: rowRightEdge + inputProblem.partitionGap - loadAnchorBounds.minX,
            y: capacitorRailPin.y - loadRailPin.y,
          },
        },
        context,
      )

      if (movedPartitionOverlaps({ movedChipIds: loadChipIds }, context)) {
        // A readability adjustment must never introduce a body collision.
        for (const [chipId, placement] of previousPlacements) {
          layout.chipPlacements[chipId] = placement
        }
        continue
      }

      const placedBounds = getPartitionBounds({ chipIds: loadChipIds }, context)
      if (placedBounds) rowRightEdge = placedBounds.maxX
      placedLoadGroups.add(loadGroup)
    }
  }

  return layout
}
