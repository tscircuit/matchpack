import type { ChipId, InputProblem } from "lib/types/InputProblem"
import type { Placement } from "lib/types/OutputLayout"
import { getRotatedSize } from "lib/utils/rotatePinOffset"

const MINIMUM_SEARCH_STEP = 0.2
const SEARCH_BOUNDARY_PADDING_STEPS = 2

export type UnconnectedTestPointAlignment = {
  orientation: "horizontal" | "vertical"
  chipIds: ChipId[]
  perpendicularOffset: number
}

type AlignmentCandidate = UnconnectedTestPointAlignment & {
  placements: Record<ChipId, Placement>
  movement: number
}

export type PlacementPair = {
  chipIdA: ChipId
  placementA: Placement
  chipIdB: ChipId
  placementB: Placement
}

type AlignUnconnectedTestPointsInput = {
  inputProblem: InputProblem
  chipIds: ChipId[]
  chipPlacements: Record<ChipId, Placement>
  placementsOverlap: (placementPair: PlacementPair) => boolean
}

type Axis = "x" | "y"

const ALIGNMENT_AXES: Record<
  "horizontal" | "vertical",
  { alignmentAxis: Axis; perpendicularAxis: Axis }
> = {
  horizontal: { alignmentAxis: "x", perpendicularAxis: "y" },
  vertical: { alignmentAxis: "y", perpendicularAxis: "x" },
}

const createAlignmentCandidate = ({
  inputProblem,
  chipIds,
  chipPlacements,
  placementsOverlap,
  orientation,
}: AlignUnconnectedTestPointsInput & {
  orientation: "horizontal" | "vertical"
}): AlignmentCandidate => {
  const { alignmentAxis, perpendicularAxis } = ALIGNMENT_AXES[orientation]
  const entries = chipIds
    .map((chipId) => {
      const placement = chipPlacements[chipId]!
      return {
        chipId,
        placement,
        size: getRotatedSize(
          inputProblem.chipMap[chipId]!.size,
          placement.ccwRotationDegrees,
        ),
      }
    })
    .sort(
      (a, b) =>
        a.placement[alignmentAxis] - b.placement[alignmentAxis] ||
        a.chipId.localeCompare(b.chipId),
    )

  const perpendicularCenter =
    entries.reduce(
      (sum, entry) => sum + entry.placement[perpendicularAxis],
      0,
    ) / entries.length
  const alignedCenters: number[] = []
  let previousEnd = -Infinity

  for (const entry of entries) {
    const extent = entry.size[alignmentAxis]
    const center = Math.max(
      entry.placement[alignmentAxis],
      previousEnd + inputProblem.chipGap + extent / 2,
    )
    alignedCenters.push(center)
    previousEnd = center + extent / 2
  }

  const centeringOffset =
    alignedCenters.reduce(
      (sum, center, index) =>
        sum + center - entries[index]!.placement[alignmentAxis],
      0,
    ) / entries.length
  const basePlacements: Record<ChipId, Placement> = {}

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!
    basePlacements[entry.chipId] = {
      ...entry.placement,
      [alignmentAxis]: alignedCenters[index]! - centeringOffset,
      [perpendicularAxis]: perpendicularCenter,
    }
  }

  const groupChipIds = new Set(chipIds)
  const step = Math.max(
    inputProblem.partitionGap / 2,
    inputProblem.chipGap,
    MINIMUM_SEARCH_STEP,
  )
  const maximumGroupExtent = Math.max(
    ...entries.map((entry) => entry.size[perpendicularAxis]),
  )
  const maximumDistance =
    Object.entries(chipPlacements).reduce((maximum, [chipId, placement]) => {
      if (groupChipIds.has(chipId)) return maximum
      const size = getRotatedSize(
        inputProblem.chipMap[chipId]!.size,
        placement.ccwRotationDegrees,
      )
      return Math.max(
        maximum,
        Math.abs(placement[perpendicularAxis] - perpendicularCenter) +
          size[perpendicularAxis] +
          maximumGroupExtent,
      )
    }, 0) + inputProblem.partitionGap
  const maximumSteps =
    Math.ceil(maximumDistance / step) + SEARCH_BOUNDARY_PADDING_STEPS
  let perpendicularOffset: number | null = null

  for (let stepIndex = 0; stepIndex <= maximumSteps; stepIndex++) {
    let offsets = [0]
    if (stepIndex > 0) {
      offsets = [-stepIndex * step, stepIndex * step]
    }
    const collisionFreeOffset = offsets.find(
      (offset) =>
        !entries.some((entry) => {
          const placement = {
            ...basePlacements[entry.chipId]!,
            [perpendicularAxis]:
              basePlacements[entry.chipId]![perpendicularAxis] + offset,
          }
          return Object.entries(chipPlacements).some(
            ([otherChipId, otherPlacement]) =>
              !groupChipIds.has(otherChipId) &&
              placementsOverlap({
                chipIdA: entry.chipId,
                placementA: placement,
                chipIdB: otherChipId,
                placementB: otherPlacement,
              }),
          )
        }),
    )
    if (collisionFreeOffset !== undefined) {
      perpendicularOffset = collisionFreeOffset
      break
    }
  }
  if (perpendicularOffset === null) {
    throw new Error("Unable to align unconnected testpoints without overlap")
  }

  const placements = Object.fromEntries(
    entries.map((entry) => {
      const placement = basePlacements[entry.chipId]!
      return [
        entry.chipId,
        {
          ...placement,
          [perpendicularAxis]:
            placement[perpendicularAxis] + perpendicularOffset,
        },
      ]
    }),
  )
  const movement = entries.reduce((sum, entry) => {
    const placement = placements[entry.chipId]!
    return (
      sum +
      (placement.x - entry.placement.x) ** 2 +
      (placement.y - entry.placement.y) ** 2
    )
  }, 0)

  return {
    orientation,
    chipIds: entries.map((entry) => entry.chipId),
    perpendicularOffset,
    placements,
    movement,
  }
}

export const alignUnconnectedTestPoints = (
  input: AlignUnconnectedTestPointsInput,
): {
  alignment: UnconnectedTestPointAlignment
  placements: Record<ChipId, Placement>
} | null => {
  if (input.chipIds.length < 2) return null

  const bestCandidate = (["horizontal", "vertical"] as const)
    .map((orientation) => createAlignmentCandidate({ ...input, orientation }))
    .sort(
      (a, b) =>
        a.movement - b.movement || a.orientation.localeCompare(b.orientation),
    )[0]!

  return {
    alignment: {
      orientation: bestCandidate.orientation,
      chipIds: bestCandidate.chipIds,
      perpendicularOffset: bestCandidate.perpendicularOffset,
    },
    placements: bestCandidate.placements,
  }
}
