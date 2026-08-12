import type { ChipId, InputProblem, NetId } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"

type GroundedLoadPairBounds = {
  minX: number
  maxX: number
}

type GroundedLoadRowContext = {
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}

const MINIMUM_PAIRS_PER_ROW = 2

const getPairBounds = (
  groundedLoadPair: GroundedLoadPair,
  context: GroundedLoadRowContext,
): GroundedLoadPairBounds => {
  const { chipPlacements } = context
  const upperPlacement = chipPlacements[groundedLoadPair.upperChip.chipId]!
  const lowerPlacement = chipPlacements[groundedLoadPair.lowerChip.chipId]!
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
  groundedLoadPair: GroundedLoadPair,
  context: GroundedLoadRowContext,
): number => {
  const { chipPlacements, inputProblem } = context
  const placement = chipPlacements[groundedLoadPair.lowerChip.chipId]!
  const groundPin = inputProblem.chipPinMap[groundedLoadPair.groundPinId]!
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
    const placement = chipPlacements[chipId]!
    placement.x += dx
    placement.y += dy
  }
}

const getLeftPairEdge = (
  groundedLoadPair: GroundedLoadPair,
  context: GroundedLoadRowContext,
): number => {
  return getPairBounds(groundedLoadPair, context).minX
}

const alignGroundedLoadPairRow = (
  groundedLoadPairs: GroundedLoadPair[],
  context: GroundedLoadRowContext,
): void => {
  const { inputProblem } = context
  const leftToRightPairs = [...groundedLoadPairs].sort(
    (pairA, pairB) =>
      getLeftPairEdge(pairA, context) - getLeftPairEdge(pairB, context),
  )
  const initialGroundPinYs = leftToRightPairs.map((groundedLoadPair) =>
    getGroundPinY(groundedLoadPair, context),
  )

  const targetGroundPinY = Math.min(...initialGroundPinYs)
  for (const groundedLoadPair of leftToRightPairs) {
    const groundPinY = getGroundPinY(groundedLoadPair, context)
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
  for (const groundedLoadPair of leftToRightPairs) {
    const pairBounds = getPairBounds(groundedLoadPair, context)
    if (previousPairMaxX === undefined) {
      previousPairMaxX = pairBounds.maxX
      continue
    }
    const dx = previousPairMaxX + inputProblem.partitionGap - pairBounds.minX
    translateGroundedLoadPair(
      {
        groundedLoadPair,
        dx,
        dy: 0,
      },
      context,
    )
    previousPairMaxX = pairBounds.maxX + dx
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
    if (!chipPlacements[groundedLoadPair.upperChip.chipId]) continue
    if (!chipPlacements[groundedLoadPair.lowerChip.chipId]) continue
    if (!inputProblem.chipPinMap[groundedLoadPair.groundPinId]) continue
    const groundNetId = groundedLoadPair.groundNetId
    const rowPairs = pairsByGroundNetId.get(groundNetId) ?? []
    rowPairs.push(groundedLoadPair)
    pairsByGroundNetId.set(groundNetId, rowPairs)
  }

  for (const rowPairs of pairsByGroundNetId.values()) {
    if (rowPairs.length < MINIMUM_PAIRS_PER_ROW) continue
    alignGroundedLoadPairRow(rowPairs, context)
  }
}
