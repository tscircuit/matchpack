import type { ChipId, InputProblem, NetId } from "../../types/InputProblem"
import type { Side } from "../../types/Side"

export const getDecouplingMainChipSide = (
  problem: InputProblem,
  mainChipId: ChipId,
  netPair: [NetId, NetId],
): Side | null => {
  const mainChip = problem.chipMap[mainChipId]
  if (!mainChip) return null

  const positiveNetIds = netPair.filter(
    (netId) => problem.netMap[netId]?.isPositiveVoltageSource,
  )
  const sideCounts = new Map<Side, number>()

  for (const pinId of mainChip.pins) {
    const pin = problem.chipPinMap[pinId]
    if (!pin) continue

    const isOnPositiveNet = positiveNetIds.some(
      (netId) => problem.netConnMap[`${pinId}-${netId}`],
    )
    if (!isOnPositiveNet) continue
    sideCounts.set(pin.side, (sideCounts.get(pin.side) ?? 0) + 1)
  }

  let selectedSide: Side | null = null
  let selectedSideCount = 0
  for (const [side, count] of sideCounts) {
    if (count <= selectedSideCount) continue
    selectedSide = side
    selectedSideCount = count
  }
  return selectedSide
}
