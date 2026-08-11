import type { NetId } from "../../types/InputProblem"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"

export type GroundedLoadPairPartition = {
  positiveRailNetId?: NetId
  groundedLoadPairs: GroundedLoadPair[]
}

export const partitionGroundedLoadPairsByPositiveRail = ({
  groundedLoadPairs,
}: {
  groundedLoadPairs: GroundedLoadPair[]
}): GroundedLoadPairPartition[] => {
  const partitions: GroundedLoadPairPartition[] = []

  for (const groundedLoadPair of groundedLoadPairs) {
    const { positiveRailNetId } = groundedLoadPair
    const existingPartition = partitions.find(
      (partition) => partition.positiveRailNetId === positiveRailNetId,
    )
    if (existingPartition) {
      existingPartition.groundedLoadPairs.push(groundedLoadPair)
      continue
    }
    partitions.push({
      positiveRailNetId,
      groundedLoadPairs: [groundedLoadPair],
    })
  }

  return partitions
}
