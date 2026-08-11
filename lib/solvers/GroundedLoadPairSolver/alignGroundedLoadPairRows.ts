import type { ChipId, InputProblem, NetId } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import {
  getPlacementBounds,
  placementsOverlap,
} from "../AlignTestPointsSolver/placementsOverlap"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"
import { partitionGroundedLoadPairsByPositiveRail } from "./partitionGroundedLoadPairsByPositiveRail"

type GroundedLoadPairBounds = {
  minX: number
  maxX: number
}

type GroundedLoadRowContext = {
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}

const MINIMUM_PAIRS_PER_ROW = 2
const MINIMUM_COLLISION_SEARCH_STEP = 0.2

const getPairBounds = (
  {
    groundedLoadPair,
  }: {
    groundedLoadPair: GroundedLoadPair
  },
  context: GroundedLoadRowContext,
): GroundedLoadPairBounds | null => {
  const { chipPlacements, inputProblem } = context
  const upperPlacement = chipPlacements[groundedLoadPair.upperChip.chipId]
  const lowerPlacement = chipPlacements[groundedLoadPair.lowerChip.chipId]
  if (!upperPlacement || !lowerPlacement) return null
  const upperBounds = getPlacementBounds({
    placement: upperPlacement,
    size: groundedLoadPair.upperChip.size,
  })
  const lowerBounds = getPlacementBounds({
    placement: lowerPlacement,
    size: groundedLoadPair.lowerChip.size,
  })

  return {
    minX: Math.min(upperBounds.minX, lowerBounds.minX),
    maxX: Math.max(upperBounds.maxX, lowerBounds.maxX),
  }
}

const getGroundPinY = (
  {
    groundedLoadPair,
  }: {
    groundedLoadPair: GroundedLoadPair
  },
  context: GroundedLoadRowContext,
): number | undefined => {
  const { chipPlacements, inputProblem } = context
  const placement = chipPlacements[groundedLoadPair.lowerChip.chipId]
  const groundPin = inputProblem.chipPinMap[groundedLoadPair.groundPinId]
  if (!placement || !groundPin) return
  const groundPinOffset = rotatePinOffset(
    groundPin.offset,
    placement.ccwRotationDegrees,
  )
  return placement.y + groundPinOffset.y
}

const translateGroundedLoadPair = (
  {
    groundedLoadPair,
    dx,
    dy,
  }: {
    groundedLoadPair: GroundedLoadPair
    dx: number
    dy: number
  },
  context: GroundedLoadRowContext,
): void => {
  const { chipPlacements } = context
  for (const chipId of [
    groundedLoadPair.upperChip.chipId,
    groundedLoadPair.lowerChip.chipId,
  ]) {
    const placement = chipPlacements[chipId]
    if (!placement) continue
    placement.x += dx
    placement.y += dy
  }
}

const getLeftPairEdge = (
  {
    groundedLoadPair,
  }: {
    groundedLoadPair: GroundedLoadPair
  },
  context: GroundedLoadRowContext,
): number => {
  const bounds = getPairBounds({ groundedLoadPair }, context)
  if (!bounds) return 0
  return bounds.minX
}

const rowOverlapsOtherChips = (
  { groundedLoadPairs }: { groundedLoadPairs: GroundedLoadPair[] },
  context: GroundedLoadRowContext,
): boolean => {
  const pairedChipIds = new Set(
    groundedLoadPairs.flatMap((groundedLoadPair) => [
      groundedLoadPair.upperChip.chipId,
      groundedLoadPair.lowerChip.chipId,
    ]),
  )
  return [...pairedChipIds].some((chipId) =>
    Object.entries(context.chipPlacements).some(
      ([otherChipId, otherPlacement]) => {
        if (pairedChipIds.has(otherChipId)) return false
        if (context.inputProblem.chipMap[otherChipId]?.isTestPoint) return false
        return placementsOverlap({
          inputProblem: context.inputProblem,
          chipIdA: chipId,
          placementA: context.chipPlacements[chipId]!,
          chipIdB: otherChipId,
          placementB: otherPlacement,
        })
      },
    ),
  )
}

const alignGroundedLoadPairRow = (
  {
    groundedLoadPairs,
  }: {
    groundedLoadPairs: GroundedLoadPair[]
  },
  context: GroundedLoadRowContext,
): void => {
  const { chipPlacements, inputProblem } = context
  const leftToRightPairs = [...groundedLoadPairs].sort(
    (pairA, pairB) =>
      getLeftPairEdge(
        {
          groundedLoadPair: pairA,
        },
        context,
      ) -
      getLeftPairEdge(
        {
          groundedLoadPair: pairB,
        },
        context,
      ),
  )
  const pairPartitions = partitionGroundedLoadPairsByPositiveRail({
    groundedLoadPairs: leftToRightPairs,
  })
  const orderedPairs = pairPartitions.flatMap(
    (partition) => partition.groundedLoadPairs,
  )
  const initialGroundPinYs = orderedPairs.flatMap((groundedLoadPair) => {
    const groundPinY = getGroundPinY({ groundedLoadPair }, context)
    if (groundPinY === undefined) return []
    return [groundPinY]
  })
  if (initialGroundPinYs.length !== orderedPairs.length) return

  const targetGroundPinY = Math.min(...initialGroundPinYs)
  for (const groundedLoadPair of orderedPairs) {
    const groundPinY = getGroundPinY({ groundedLoadPair }, context)
    if (groundPinY === undefined) continue
    translateGroundedLoadPair(
      {
        groundedLoadPair,
        dx: 0,
        dy: targetGroundPinY - groundPinY,
      },
      context,
    )
  }

  let previousPairMaxX: number | undefined
  const hasMultiplePartitions = pairPartitions.length > 1
  for (const pairPartition of pairPartitions) {
    let firstPairInPartition = true
    for (const groundedLoadPair of pairPartition.groundedLoadPairs) {
      const pairBounds = getPairBounds({ groundedLoadPair }, context)
      if (!pairBounds) continue
      if (previousPairMaxX === undefined) {
        previousPairMaxX = pairBounds.maxX
        firstPairInPartition = false
        continue
      }
      let pairGap = inputProblem.partitionGap
      if (hasMultiplePartitions && !firstPairInPartition) {
        pairGap = inputProblem.chipGap
      }
      const dx = previousPairMaxX + pairGap - pairBounds.minX
      translateGroundedLoadPair(
        {
          groundedLoadPair,
          dx,
          dy: 0,
        },
        context,
      )
      previousPairMaxX = pairBounds.maxX + dx
      firstPairInPartition = false
    }
  }

  const collisionSearchStep = Math.max(
    inputProblem.chipGap,
    MINIMUM_COLLISION_SEARCH_STEP,
  )
  while (rowOverlapsOtherChips({ groundedLoadPairs: orderedPairs }, context)) {
    for (const groundedLoadPair of orderedPairs) {
      translateGroundedLoadPair(
        { groundedLoadPair, dx: 0, dy: -collisionSearchStep },
        context,
      )
    }
  }
}

export const alignGroundedLoadPairRows = ({
  groundedLoadPairs,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPairs: GroundedLoadPair[]
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): void => {
  const context = { chipPlacements, inputProblem }
  const pairsByGroundNetId = new Map<NetId, GroundedLoadPair[]>()
  for (const groundedLoadPair of groundedLoadPairs) {
    if (groundedLoadPair.mainChipId) continue
    const groundNetId = groundedLoadPair.groundNetId
    const rowPairs = pairsByGroundNetId.get(groundNetId) ?? []
    rowPairs.push(groundedLoadPair)
    pairsByGroundNetId.set(groundNetId, rowPairs)
  }

  for (const rowPairs of pairsByGroundNetId.values()) {
    if (rowPairs.length < MINIMUM_PAIRS_PER_ROW) continue
    alignGroundedLoadPairRow(
      {
        groundedLoadPairs: rowPairs,
      },
      context,
    )
  }
}
