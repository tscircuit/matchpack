import type { ChipId, InputProblem, PinId } from "../../types/InputProblem"
import {
  getChipPinConnectedTwoPinComponentGroups,
  pinConnectsToGround,
  pinConnectsToPositiveVoltage,
  type ChipPinConnectedTwoPinComponent,
} from "../../utils/getChipPinConnectedTwoPinComponents"

const SAME_NODE_PAIR_SIZE = 2

export type ChipConnectedSameNodePair = {
  mainChipId: ChipId
  mainPinId: PinId
  components: [ChipPinConnectedTwoPinComponent, ChipPinConnectedTwoPinComponent]
}

export const getChipConnectedSameNodePairs = (
  inputProblem: InputProblem,
): ChipConnectedSameNodePair[] => {
  const pairs: ChipConnectedSameNodePair[] = []

  for (const group of getChipPinConnectedTwoPinComponentGroups(inputProblem)) {
    if (group.components.length !== SAME_NODE_PAIR_SIZE) continue
    if (group.components.some(({ chip }) => chip.isCrystal)) continue
    const groundedComponents = group.components.filter(({ outerPinId }) =>
      pinConnectsToGround(inputProblem, outerPinId),
    )
    const railConnectedComponents = group.components.filter(({ outerPinId }) =>
      pinConnectsToPositiveVoltage(inputProblem, outerPinId),
    )
    if (
      groundedComponents.length !== 1 ||
      railConnectedComponents.length !== 1
    ) {
      continue
    }
    const firstComponent = group.components[0]!
    const secondComponent = group.components[1]!
    pairs.push({
      mainChipId: group.mainChipId,
      mainPinId: group.mainPinId,
      components: [firstComponent, secondComponent],
    })
  }

  return pairs
}
