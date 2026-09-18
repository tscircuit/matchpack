import { boundsAreaOverlap } from "@tscircuit/math-utils"
import type { ChipId, InputProblem } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { getPlacementBounds } from "../../utils/getPlacementBounds"
export { getPlacementBounds }

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
