import type { ChipId, InputProblem } from "lib/types/InputProblem"
import type { Placement } from "lib/types/OutputLayout"
import { getRotatedSize } from "lib/utils/rotatePinOffset"
import { placementsOverlap } from "./placementsOverlap"

type Axis = "x" | "y"

type TestPointPlacementContext = {
  inputProblem: InputProblem
  chipPlacements: Record<ChipId, Placement>
}

type LooseTestPointRow = Record<ChipId, Placement>

const MINIMUM_COLLISION_SEARCH_STEP = 0.2

const getLooseTestPointRowAxes = (
  { looseTestPointChipIds }: { looseTestPointChipIds: ChipId[] },
  context: TestPointPlacementContext,
): { perpendicularAxis: Axis; tangentAxis: Axis } => {
  const xPositions = looseTestPointChipIds.map(
    (chipId) => context.chipPlacements[chipId]!.x,
  )
  const yPositions = looseTestPointChipIds.map(
    (chipId) => context.chipPlacements[chipId]!.y,
  )
  const horizontalSpan = Math.max(...xPositions) - Math.min(...xPositions)
  const verticalSpan = Math.max(...yPositions) - Math.min(...yPositions)
  if (horizontalSpan >= verticalSpan) {
    return { perpendicularAxis: "y", tangentAxis: "x" }
  }
  return { perpendicularAxis: "x", tangentAxis: "y" }
}

const packLooseTestPointRow = (
  {
    looseTestPointChipIds,
    perpendicularAxis,
    tangentAxis,
  }: {
    looseTestPointChipIds: ChipId[]
    perpendicularAxis: Axis
    tangentAxis: Axis
  },
  context: TestPointPlacementContext,
): LooseTestPointRow => {
  const perpendicularCenter =
    looseTestPointChipIds.reduce(
      (sum, chipId) => sum + context.chipPlacements[chipId]![perpendicularAxis],
      0,
    ) / looseTestPointChipIds.length
  const orderedTestPointChipIds = [...looseTestPointChipIds].sort(
    (chipIdA, chipIdB) =>
      context.chipPlacements[chipIdA]![tangentAxis] -
      context.chipPlacements[chipIdB]![tangentAxis],
  )
  const testPointRow: LooseTestPointRow = {}
  let previousTestPointChipId: ChipId | undefined

  for (const chipId of orderedTestPointChipIds) {
    const placement = {
      ...context.chipPlacements[chipId]!,
      [perpendicularAxis]: perpendicularCenter,
    }
    if (previousTestPointChipId) {
      const previousPlacement = testPointRow[previousTestPointChipId]!
      const previousSize = getRotatedSize(
        context.inputProblem.chipMap[previousTestPointChipId]!.size,
        previousPlacement.ccwRotationDegrees,
      )
      const size = getRotatedSize(
        context.inputProblem.chipMap[chipId]!.size,
        placement.ccwRotationDegrees,
      )
      const minimumTangentPosition =
        previousPlacement[tangentAxis] +
        previousSize[tangentAxis] / 2 +
        context.inputProblem.chipGap +
        size[tangentAxis] / 2
      if (placement[tangentAxis] < minimumTangentPosition) {
        placement[tangentAxis] = minimumTangentPosition
      }
    }
    testPointRow[chipId] = placement
    previousTestPointChipId = chipId
  }

  return testPointRow
}

const testPointRowOverlapsOtherChips = (
  {
    looseTestPointChipIds,
    testPointRow,
  }: {
    looseTestPointChipIds: ChipId[]
    testPointRow: LooseTestPointRow
  },
  context: TestPointPlacementContext,
): boolean => {
  const looseTestPointChipIdSet = new Set(looseTestPointChipIds)
  return looseTestPointChipIds.some((chipId) =>
    Object.entries(context.chipPlacements).some(
      ([otherChipId, otherPlacement]) =>
        !looseTestPointChipIdSet.has(otherChipId) &&
        placementsOverlap({
          inputProblem: context.inputProblem,
          chipIdA: chipId,
          placementA: testPointRow[chipId]!,
          chipIdB: otherChipId,
          placementB: otherPlacement,
        }),
    ),
  )
}

const moveLooseTestPointRowUntilClear = (
  {
    looseTestPointChipIds,
    perpendicularAxis,
    testPointRow,
  }: {
    looseTestPointChipIds: ChipId[]
    perpendicularAxis: Axis
    testPointRow: LooseTestPointRow
  },
  context: TestPointPlacementContext,
): LooseTestPointRow => {
  const searchStep = Math.max(
    context.inputProblem.chipGap,
    MINIMUM_COLLISION_SEARCH_STEP,
  )
  let searchStepIndex = 0

  // The schematic plane is unbounded, so a clear row is always reachable.
  while (true) {
    const offsets = [0]
    if (searchStepIndex > 0) {
      offsets.length = 0
      offsets.push(-searchStepIndex * searchStep, searchStepIndex * searchStep)
    }
    for (const offset of offsets) {
      const shiftedTestPointRow = structuredClone(testPointRow)
      for (const chipId of looseTestPointChipIds) {
        shiftedTestPointRow[chipId]![perpendicularAxis] += offset
      }
      if (
        !testPointRowOverlapsOtherChips(
          { looseTestPointChipIds, testPointRow: shiftedTestPointRow },
          context,
        )
      ) {
        return shiftedTestPointRow
      }
    }
    searchStepIndex++
  }
}

export const alignLooseTestPoints = (
  { anchoredTestPointChipIds }: { anchoredTestPointChipIds: Set<ChipId> },
  context: TestPointPlacementContext,
): void => {
  const looseTestPointChipIds = Object.values(context.inputProblem.chipMap)
    .filter(
      (chip) =>
        chip.isTestPoint &&
        !chip.fixedPosition &&
        chip.pins.length === 1 &&
        context.chipPlacements[chip.chipId] &&
        !anchoredTestPointChipIds.has(chip.chipId),
    )
    .map((chip) => chip.chipId)
  if (looseTestPointChipIds.length < 2) return

  const { perpendicularAxis, tangentAxis } = getLooseTestPointRowAxes(
    { looseTestPointChipIds },
    context,
  )
  const testPointRow = packLooseTestPointRow(
    { looseTestPointChipIds, perpendicularAxis, tangentAxis },
    context,
  )
  const clearTestPointRow = moveLooseTestPointRowUntilClear(
    { looseTestPointChipIds, perpendicularAxis, testPointRow },
    context,
  )
  for (const [chipId, placement] of Object.entries(clearTestPointRow)) {
    context.chipPlacements[chipId] = placement
  }
}
