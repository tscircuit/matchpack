import { getVerticalPinClearanceOffset } from "../../utils/getVerticalPinClearanceOffset"
import {
  tryOffsetChips,
  offsetChipAnchoredGroundedLoadConnections,
} from "../../utils/offsetCollinearConnections"
import type { ChipId, InputProblem, NetId } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"

type GroundedLoadPairBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
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
    minY: Math.min(upperBounds.minY, lowerBounds.minY),
    maxY: Math.max(upperBounds.maxY, lowerBounds.maxY),
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

const getRowBounds = (
  groundedLoadPairs: GroundedLoadPair[],
  context: GroundedLoadRowContext,
): GroundedLoadPairBounds => {
  const pairBounds = groundedLoadPairs.map((groundedLoadPair) =>
    getPairBounds(groundedLoadPair, context),
  )
  return {
    minX: Math.min(...pairBounds.map((bounds) => bounds.minX)),
    maxX: Math.max(...pairBounds.map((bounds) => bounds.maxX)),
    minY: Math.min(...pairBounds.map((bounds) => bounds.minY)),
    maxY: Math.max(...pairBounds.map((bounds) => bounds.maxY)),
  }
}

const haveVerticalClearance = (
  firstBounds: GroundedLoadPairBounds,
  secondBounds: GroundedLoadPairBounds,
  minimumGap: number,
): boolean =>
  firstBounds.maxY + minimumGap <= secondBounds.minY ||
  secondBounds.maxY + minimumGap <= firstBounds.minY

const pairNeedsSeparation = (
  firstPair: GroundedLoadPair,
  secondPair: GroundedLoadPair,
  context: GroundedLoadRowContext,
): boolean => {
  const { inputProblem } = context
  const firstBounds = getPairBounds(firstPair, context)
  const secondBounds = getPairBounds(secondPair, context)
  const hasHorizontalClearance =
    firstBounds.maxX + inputProblem.chipGap <= secondBounds.minX ||
    secondBounds.maxX + inputProblem.chipGap <= firstBounds.minX
  const hasVerticalClearance = haveVerticalClearance(
    firstBounds,
    secondBounds,
    inputProblem.chipGap,
  )

  return !hasHorizontalClearance && !hasVerticalClearance
}

const getPairCollisionGroups = (
  groundedLoadPairs: GroundedLoadPair[],
  context: GroundedLoadRowContext,
): GroundedLoadPair[][] => {
  const remainingPairs = new Set(groundedLoadPairs)
  const collisionGroups: GroundedLoadPair[][] = []

  // Resolve connected collision groups independently so clear branches remain
  // in their existing positions.
  while (remainingPairs.size > 0) {
    const firstPair = remainingPairs.values().next().value
    if (!firstPair) break
    remainingPairs.delete(firstPair)

    const collisionGroup = [firstPair]
    for (let pairIndex = 0; pairIndex < collisionGroup.length; pairIndex++) {
      const pair = collisionGroup[pairIndex]!
      for (const candidatePair of [...remainingPairs]) {
        if (!pairNeedsSeparation(pair, candidatePair, context)) continue
        remainingPairs.delete(candidatePair)
        collisionGroup.push(candidatePair)
      }
    }

    if (collisionGroup.length >= MINIMUM_PAIRS_PER_ROW) {
      collisionGroups.push(collisionGroup)
    }
  }

  return collisionGroups
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

const separateChipAnchoredPairs = (
  groundedLoadPairs: GroundedLoadPair[],
  context: GroundedLoadRowContext,
): void => {
  const { inputProblem } = context
  const leftToRightPairs = [...groundedLoadPairs].sort(
    (pairA, pairB) =>
      getLeftPairEdge(pairA, context) - getLeftPairEdge(pairB, context),
  )
  const initialBounds = getRowBounds(leftToRightPairs, context)

  const separatedPairs: GroundedLoadPair[] = []
  for (const groundedLoadPair of leftToRightPairs) {
    const pairBounds = getPairBounds(groundedLoadPair, context)
    let requiredMinX = pairBounds.minX
    for (const separatedPair of separatedPairs) {
      const separatedBounds = getPairBounds(separatedPair, context)
      if (
        haveVerticalClearance(separatedBounds, pairBounds, inputProblem.chipGap)
      ) {
        continue
      }
      requiredMinX = Math.max(
        requiredMinX,
        separatedBounds.maxX + inputProblem.chipGap,
      )
    }
    translateGroundedLoadPair(
      { groundedLoadPair, dx: requiredMinX - pairBounds.minX, dy: 0 },
      context,
    )
    separatedPairs.push(groundedLoadPair)
  }

  // Preserve the cluster's original center while retaining every pair's Y.
  const separatedBounds = getRowBounds(leftToRightPairs, context)
  const centerOffsetX =
    (initialBounds.minX +
      initialBounds.maxX -
      separatedBounds.minX -
      separatedBounds.maxX) /
    2
  for (const groundedLoadPair of leftToRightPairs) {
    translateGroundedLoadPair(
      { groundedLoadPair, dx: centerOffsetX, dy: 0 },
      context,
    )
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
  const pairsByGroundAndMainChip = new Map<
    NetId,
    Map<ChipId | undefined, GroundedLoadPair[]>
  >()
  for (const groundedLoadPair of groundedLoadPairs) {
    if (!chipPlacements[groundedLoadPair.upperChip.chipId]) continue
    if (!chipPlacements[groundedLoadPair.lowerChip.chipId]) continue
    if (!inputProblem.chipPinMap[groundedLoadPair.groundPinId]) continue
    const pairsByMainChip =
      pairsByGroundAndMainChip.get(groundedLoadPair.groundNetId) ??
      new Map<ChipId | undefined, GroundedLoadPair[]>()
    const rowPairs = pairsByMainChip.get(groundedLoadPair.mainChipId) ?? []
    rowPairs.push(groundedLoadPair)
    pairsByMainChip.set(groundedLoadPair.mainChipId, rowPairs)
    pairsByGroundAndMainChip.set(groundedLoadPair.groundNetId, pairsByMainChip)
  }

  for (const pairsByMainChip of pairsByGroundAndMainChip.values()) {
    for (const rowPairs of pairsByMainChip.values()) {
      if (rowPairs.length < MINIMUM_PAIRS_PER_ROW) continue
      const isChipAnchoredRow = rowPairs[0]!.mainChipId !== undefined
      if (!isChipAnchoredRow) {
        alignGroundedLoadPairRow(rowPairs, context)
        continue
      }
      for (const collisionGroup of getPairCollisionGroups(rowPairs, context)) {
        separateChipAnchoredPairs(collisionGroup, context)
      }
    }
  }
  const alignedPairs = alignChipAnchoredLoadPairRows({
    groundedLoadPairs,
    chipPlacements,
    inputProblem,
  })
  offsetChipAnchoredGroundedLoadConnections({
    groundedLoadPairs: groundedLoadPairs.filter(
      (pair) => !alignedPairs.has(pair),
    ),
    chipPlacements,
    inputProblem,
  })
}

const SIDE_DIRECTIONS = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}
const MINIMUM_SIDE_PAIRS = 2

const alignChipAnchoredLoadPairRows = ({
  inputProblem,
  chipPlacements,
  groundedLoadPairs,
}: {
  inputProblem: InputProblem
  chipPlacements: Record<ChipId, Placement>
  groundedLoadPairs: GroundedLoadPair[]
}): Set<GroundedLoadPair> => {
  const alignedPairs = new Set<GroundedLoadPair>()
  const remainingPairs = new Set(groundedLoadPairs)
  for (const pair of remainingPairs) {
    if (!pair.mainChipId || !pair.mainPinId) continue
    const mainPin = inputProblem.chipPinMap[pair.mainPinId]!
    const sidePairs = groundedLoadPairs.filter(
      (candidate) =>
        candidate.mainChipId === pair.mainChipId &&
        candidate.mainPinId &&
        inputProblem.chipPinMap[candidate.mainPinId]!.side === mainPin.side,
    )
    if (sidePairs.length < MINIMUM_SIDE_PAIRS) continue
    const mainPlacement = chipPlacements[pair.mainChipId]!
    const direction = rotatePinOffset(
      SIDE_DIRECTIONS[mainPin.side],
      mainPlacement.ccwRotationDegrees,
    )
    if (Math.abs(direction.x) < 0.5) continue
    // Place the lowest pin nearest a left-side IC, so the row steps down
    // from left to right in the same order as the IC pins.
    sidePairs.sort((first, second) => {
      const firstOffset = rotatePinOffset(
        inputProblem.chipPinMap[first.mainPinId!]!.offset,
        mainPlacement.ccwRotationDegrees,
      )
      const secondOffset = rotatePinOffset(
        inputProblem.chipPinMap[second.mainPinId!]!.offset,
        mainPlacement.ccwRotationDegrees,
      )
      return (secondOffset.y - firstOffset.y) * direction.x
    })
    const mainBounds = getPlacementBounds({
      placement: mainPlacement,
      size: inputProblem.chipMap[pair.mainChipId]!.size,
    })
    let rowOutsideEdge: number | undefined
    for (const pair of sidePairs) {
      remainingPairs.delete(pair)
      const mainPin = inputProblem.chipPinMap[pair.mainPinId!]!
      const chipIds = [pair.upperChip.chipId, pair.lowerChip.chipId]
      // Unplaced row members will move outward next; their old positions
      // must not push the first branch away from the chip.
      const clearanceGroupChipIds = sidePairs
        .filter(
          (candidate) => candidate === pair || remainingPairs.has(candidate),
        )
        .flatMap((candidate) => [
          candidate.upperChip.chipId,
          candidate.lowerChip.chipId,
        ])
      const upperPlacement = chipPlacements[pair.upperChip.chipId]!
      const dy = getVerticalPinClearanceOffset({
        upperPin: mainPin,
        upperPlacement: mainPlacement,
        lowerPin: inputProblem.chipPinMap[pair.upperOuterPinId]!,
        lowerPlacement: upperPlacement,
      })
      const { minX, maxX } = getPairBounds(pair, {
        chipPlacements,
        inputProblem,
      })
      let sideShift = Math.max(0, mainBounds.maxX + inputProblem.chipGap - minX)
      if (direction.x < 0) {
        sideShift = Math.min(0, mainBounds.minX - inputProblem.chipGap - maxX)
      }
      if (rowOutsideEdge !== undefined) {
        if (direction.x < 0) {
          sideShift = Math.min(
            sideShift,
            rowOutsideEdge - inputProblem.chipGap - maxX,
          )
        } else {
          sideShift = Math.max(
            sideShift,
            rowOutsideEdge + inputProblem.chipGap - minX,
          )
        }
      }

      // Try the nearest position first, then obstacle edges farther from the IC.
      const candidateShifts = [sideShift]
      for (const [chipId, placement] of Object.entries(chipPlacements)) {
        if (clearanceGroupChipIds.includes(chipId)) continue
        const bounds = getPlacementBounds({
          placement,
          size: inputProblem.chipMap[chipId]!.size,
        })
        let dx = bounds.maxX + inputProblem.chipGap - minX
        if (direction.x < 0) dx = bounds.minX - inputProblem.chipGap - maxX
        if (dx * direction.x < sideShift * direction.x) continue
        candidateShifts.push(dx)
      }
      candidateShifts.sort((a, b) => Math.abs(a) - Math.abs(b))
      for (const dx of candidateShifts) {
        if (
          tryOffsetChips({
            chipIds,
            clearanceGroupChipIds,
            dx,
            dy,
            chipPlacements,
            inputProblem,
          })
        ) {
          alignedPairs.add(pair)
          rowOutsideEdge = maxX + dx
          if (direction.x < 0) rowOutsideEdge = minX + dx
          break
        }
      }
    }
  }
  return alignedPairs
}
