import { getBoundFromCenteredRect } from "@tscircuit/math-utils"
import type { ChipId, InputProblem } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { getRotatedSize } from "../../utils/rotatePinOffset"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"

const getChipBounds = ({
  chipId,
  chipPlacements,
  inputProblem,
}: {
  chipId: ChipId
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}) => {
  const chip = inputProblem.chipMap[chipId]
  const placement = chipPlacements[chipId]
  if (!chip || !placement) return null
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })
}

const getPairHorizontalBounds = ({
  groundedLoadPair,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPair: GroundedLoadPair
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}) => {
  const upperBounds = getChipBounds({
    chipId: groundedLoadPair.upperChip.chipId,
    chipPlacements,
    inputProblem,
  })
  const lowerBounds = getChipBounds({
    chipId: groundedLoadPair.lowerChip.chipId,
    chipPlacements,
    inputProblem,
  })
  if (!upperBounds || !lowerBounds) return null
  return {
    minX: Math.min(upperBounds.minX, lowerBounds.minX),
    maxX: Math.max(upperBounds.maxX, lowerBounds.maxX),
  }
}

export const alignStandaloneGroundedLoadPairs = ({
  groundedLoadPairs,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPairs: GroundedLoadPair[]
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): void => {
  const standalonePairs = groundedLoadPairs.filter(
    (groundedLoadPair) => groundedLoadPair.isStandaloneSignalChain,
  )
  const firstPair = standalonePairs[0]
  if (!firstPair || standalonePairs.length < 2) return

  const firstUpperPlacement = chipPlacements[firstPair.upperChip.chipId]
  if (!firstUpperPlacement) return
  let previousRightEdge = getPairHorizontalBounds({
    groundedLoadPair: firstPair,
    chipPlacements,
    inputProblem,
  })?.maxX
  if (previousRightEdge === undefined) return

  for (const groundedLoadPair of standalonePairs.slice(1)) {
    const upperPlacement = chipPlacements[groundedLoadPair.upperChip.chipId]
    const lowerPlacement = chipPlacements[groundedLoadPair.lowerChip.chipId]
    const pairBounds = getPairHorizontalBounds({
      groundedLoadPair,
      chipPlacements,
      inputProblem,
    })
    if (!upperPlacement || !lowerPlacement || !pairBounds) continue

    const dx = previousRightEdge + inputProblem.partitionGap - pairBounds.minX
    const dy = firstUpperPlacement.y - upperPlacement.y
    upperPlacement.x += dx
    upperPlacement.y += dy
    lowerPlacement.x += dx
    lowerPlacement.y += dy

    const alignedPairBounds = getPairHorizontalBounds({
      groundedLoadPair,
      chipPlacements,
      inputProblem,
    })
    if (!alignedPairBounds) continue
    previousRightEdge = alignedPairBounds.maxX
  }
}
