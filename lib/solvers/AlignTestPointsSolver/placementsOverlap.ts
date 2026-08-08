import {
  boundsAreaOverlap,
  getBoundFromCenteredRect,
  type Point,
} from "@tscircuit/math-utils"
import type { ChipId, InputProblem } from "lib/types/InputProblem"
import type { Placement } from "lib/types/OutputLayout"
import { getRotatedSize } from "lib/utils/rotatePinOffset"

export const getPlacementBounds = ({
  placement,
  size,
  margin = 0,
}: {
  placement: Placement
  size: Point
  margin?: number
}) => {
  const rotatedSize = getRotatedSize(size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: rotatedSize.x + margin * 2,
    height: rotatedSize.y + margin * 2,
  })
}

export const placementsOverlap = ({
  inputProblem,
  chipIdA,
  placementA,
  chipIdB,
  placementB,
}: {
  inputProblem: InputProblem
  chipIdA: ChipId
  placementA: Placement
  chipIdB: ChipId
  placementB: Placement
}): boolean => {
  const boundsA = getPlacementBounds({
    placement: placementA,
    size: inputProblem.chipMap[chipIdA]!.size,
    margin: inputProblem.chipGap,
  })
  const boundsB = getPlacementBounds({
    placement: placementB,
    size: inputProblem.chipMap[chipIdB]!.size,
  })
  return boundsAreaOverlap(boundsA, boundsB) > 0
}
