import type {
  ChipId,
  InputProblem,
  PartitionInputProblem,
} from "../../types/InputProblem"

export const getGapBetweenAlignedChips = (
  { firstChipId, secondChipId }: { firstChipId: ChipId; secondChipId: ChipId },
  inputProblem: InputProblem,
  chipIdToPartition: ReadonlyMap<ChipId, PartitionInputProblem>,
): number => {
  const firstPartition = chipIdToPartition.get(firstChipId)
  const secondPartition = chipIdToPartition.get(secondChipId)

  // Only a recognized decoupling partition is intentionally compact. Every
  // other rail-row pair keeps the existing, more conservative partition gap.
  if (
    firstPartition &&
    firstPartition === secondPartition &&
    firstPartition.partitionType === "decoupling_caps"
  ) {
    return inputProblem.decouplingCapsGap ?? inputProblem.chipGap
  }

  return inputProblem.partitionGap
}
