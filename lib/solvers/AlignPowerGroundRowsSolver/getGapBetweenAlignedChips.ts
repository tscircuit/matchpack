import type { ChipId, InputProblem } from "../../types/InputProblem"

export const getGapBetweenAlignedChips = (
  { firstChipId, secondChipId }: { firstChipId: ChipId; secondChipId: ChipId },
  inputProblem: InputProblem,
): number => {
  const firstChip = inputProblem.chipMap[firstChipId]
  const secondChip = inputProblem.chipMap[secondChipId]

  // Keep decoupling rows compact inside a mixed power-rail alignment group.
  if (firstChip?.isCapacitor && secondChip?.isCapacitor) {
    return inputProblem.decouplingCapsGap ?? inputProblem.chipGap
  }
  return inputProblem.partitionGap
}
