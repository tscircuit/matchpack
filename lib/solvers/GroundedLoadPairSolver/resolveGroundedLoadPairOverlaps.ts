import { boundsAreaOverlap } from "@tscircuit/math-utils"
import type { ChipId, InputProblem } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"

export const resolveGroundedLoadPairOverlaps = ({
  groundedLoadPairs,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPairs: GroundedLoadPair[]
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): void => {
  for (const pair of groundedLoadPairs) {
    const upperPlacement = chipPlacements[pair.upperChip.chipId]
    const lowerPlacement = chipPlacements[pair.lowerChip.chipId]
    if (!upperPlacement || !lowerPlacement) continue

    const upperBounds = getPlacementBounds({
      placement: upperPlacement,
      size: pair.upperChip.size,
    })
    const lowerBounds = getPlacementBounds({
      placement: lowerPlacement,
      size: pair.lowerChip.size,
    })
    const pairBounds = {
      minX: Math.min(upperBounds.minX, lowerBounds.minX),
      maxX: Math.max(upperBounds.maxX, lowerBounds.maxX),
      minY: Math.min(upperBounds.minY, lowerBounds.minY),
      maxY: Math.max(upperBounds.maxY, lowerBounds.maxY),
    }
    const obstacles = Object.entries(chipPlacements).flatMap(
      ([chipId, placement]) => {
        if (
          chipId === pair.upperChip.chipId ||
          chipId === pair.lowerChip.chipId
        ) {
          return []
        }
        const chip = inputProblem.chipMap[chipId]
        if (!chip) return []
        return [getPlacementBounds({ placement, size: chip.size })]
      },
    )

    // Preserve clear rows. The initial downward placement and subsequent row
    // separation can each move a pair into an unrelated component.
    const hasOverlap = obstacles.some(
      (bounds) =>
        boundsAreaOverlap(upperBounds, bounds) > 0 ||
        boundsAreaOverlap(lowerBounds, bounds) > 0,
    )
    if (!hasOverlap) continue

    // Process obstacles from top to bottom, checking the translated bounds
    // so that clearing one body cannot leave the pair inside a lower body.
    obstacles.sort((a, b) => b.maxY - a.maxY)
    let downwardShift = 0
    for (const bounds of obstacles) {
      if (
        pairBounds.maxX + inputProblem.chipGap <= bounds.minX ||
        pairBounds.minX - inputProblem.chipGap >= bounds.maxX ||
        pairBounds.maxY - downwardShift + inputProblem.chipGap <= bounds.minY ||
        pairBounds.minY - downwardShift - inputProblem.chipGap >= bounds.maxY
      ) {
        continue
      }
      downwardShift = pairBounds.maxY + inputProblem.chipGap - bounds.minY
    }

    // Move both bodies together to retain their orientation and internal gap.
    upperPlacement.y -= downwardShift
    lowerPlacement.y -= downwardShift
  }
}
