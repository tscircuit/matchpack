import type { ChipId } from "../../types/InputProblem"
import type { GroundedLoadPair } from "../GroundedLoadPairSolver/getGroundedLoadPairs"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

export type RailConnectedLoadGroup = {
  chipIds: ChipId[]
}

const isTwoPinLoadPartition = (partition: PackedPartition): boolean => {
  const chips = Object.values(partition.inputProblem.chipMap)
  return (
    chips.length > 1 &&
    chips.every(
      (chip) =>
        chip.pins.length === 2 && !chip.isCapacitor && !chip.fixedPosition,
    )
  )
}

export const getRailConnectedLoadGroups = ({
  groundedLoadPairs,
  packedPartitions,
}: {
  groundedLoadPairs: GroundedLoadPair[]
  packedPartitions: PackedPartition[]
}): RailConnectedLoadGroup[] => {
  const loadPartitions = packedPartitions.filter(isTwoPinLoadPartition)
  const loadGroups = loadPartitions.map((partition) => ({
    chipIds: Object.keys(partition.inputProblem.chipMap),
  }))
  const groupedChipIds = new Set(
    loadGroups.flatMap((loadGroup) => loadGroup.chipIds),
  )

  for (const groundedLoadPair of groundedLoadPairs) {
    if (groundedLoadPair.mainChipId) continue
    if (groundedLoadPair.isStandaloneSignalChain) continue

    const pairChipIds = [
      groundedLoadPair.upperChip.chipId,
      groundedLoadPair.lowerChip.chipId,
    ]
    if (pairChipIds.some((chipId) => groupedChipIds.has(chipId))) continue

    loadGroups.push({ chipIds: pairChipIds })
    for (const chipId of pairChipIds) groupedChipIds.add(chipId)
  }

  return loadGroups
}
