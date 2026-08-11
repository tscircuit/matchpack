import type { InputProblem, NetId } from "../../types/InputProblem"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"

export type GroundedLoadPairPartition = {
  positiveRailNetId?: NetId
  groundedLoadPairs: GroundedLoadPair[]
}

const getPositiveRailNetId = ({
  groundedLoadPair,
  inputProblem,
}: {
  groundedLoadPair: GroundedLoadPair
  inputProblem: InputProblem
}): NetId | undefined => {
  for (const netId of Object.keys(inputProblem.netMap)) {
    if (!inputProblem.netMap[netId]?.isPositiveVoltageSource) continue
    if (
      inputProblem.netConnMap[`${groundedLoadPair.upperOuterPinId}-${netId}`]
    ) {
      return netId
    }
  }
}

export const partitionGroundedLoadPairsByPositiveRail = ({
  groundedLoadPairs,
  inputProblem,
}: {
  groundedLoadPairs: GroundedLoadPair[]
  inputProblem: InputProblem
}): GroundedLoadPairPartition[] => {
  const partitions: GroundedLoadPairPartition[] = []

  for (const groundedLoadPair of groundedLoadPairs) {
    const positiveRailNetId = getPositiveRailNetId({
      groundedLoadPair,
      inputProblem,
    })
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
