import type { ChipId, NetId } from "../../types/InputProblem"

export type GroundedCapacitor = {
  capacitorChipId: ChipId
  netPair: [NetId, NetId]
}

export type GroundedCapacitorGroup = {
  capacitorChipIds: ChipId[]
  netPair: [NetId, NetId]
}

const MIN_CAPACITORS_PER_GROUP = 2

const netPairsMatch = (
  firstNetPair: [NetId, NetId],
  secondNetPair: [NetId, NetId],
): boolean =>
  firstNetPair[0] === secondNetPair[0] && firstNetPair[1] === secondNetPair[1]

export const groupGroundedCapacitorsByNetPair = ({
  groundedCapacitorsWithoutPowerMetadata,
}: {
  groundedCapacitorsWithoutPowerMetadata: GroundedCapacitor[]
}): GroundedCapacitorGroup[] => {
  const groundedCapacitorGroups: GroundedCapacitorGroup[] = []

  for (const groundedCapacitor of groundedCapacitorsWithoutPowerMetadata) {
    const existingGroup = groundedCapacitorGroups.find((group) =>
      netPairsMatch(group.netPair, groundedCapacitor.netPair),
    )
    if (existingGroup) {
      existingGroup.capacitorChipIds.push(groundedCapacitor.capacitorChipId)
      continue
    }

    groundedCapacitorGroups.push({
      capacitorChipIds: [groundedCapacitor.capacitorChipId],
      netPair: groundedCapacitor.netPair,
    })
  }

  return groundedCapacitorGroups.filter(
    (group) => group.capacitorChipIds.length >= MIN_CAPACITORS_PER_GROUP,
  )
}
