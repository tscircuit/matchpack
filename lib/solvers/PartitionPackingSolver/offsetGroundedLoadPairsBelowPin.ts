import type { InputProblem, PinId } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { DIRECT_PASSIVE_VERTICAL_OFFSET } from "../PackInnerPartitionsSolver/offsetSingleDirectPassiveBelowPin"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

const getConnectedPins = (pinId: PinId, problem: InputProblem): PinId[] => {
  const connectedPins: PinId[] = []
  for (const [connection, connected] of Object.entries(
    problem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [pinA, pinB] = connection.split("-") as [PinId, PinId]
    if (pinA === pinId) connectedPins.push(pinB)
    if (pinB === pinId) connectedPins.push(pinA)
  }
  return connectedPins
}

export const offsetGroundedLoadPairsBelowPin = (
  problem: InputProblem,
  packedPartitions: PackedPartition[],
  placements: Record<string, Placement>,
): void => {
  const pinOwner = new Map<PinId, string>()
  for (const chip of Object.values(problem.chipMap)) {
    for (const pinId of chip.pins) pinOwner.set(pinId, chip.chipId)
  }

  for (const partition of packedPartitions) {
    if (partition.inputProblem.partitionType !== "grounded_load_pair") continue

    const pairChipIds = new Set(Object.keys(partition.inputProblem.chipMap))
    const chipSidePinId = Object.values(partition.inputProblem.chipMap)
      .flatMap((chip) => chip.pins)
      .find((pinId) =>
        getConnectedPins(pinId, problem).some((connectedPinId) => {
          const owner = pinOwner.get(connectedPinId)
          return owner && !pairChipIds.has(owner)
        }),
      )
    if (!chipSidePinId) continue

    const mainPinId = getConnectedPins(chipSidePinId, problem).find((pinId) => {
      const owner = pinOwner.get(pinId)
      return owner && !pairChipIds.has(owner)
    })
    if (!mainPinId) continue

    const pairChipId = pinOwner.get(chipSidePinId)!
    const mainChipId = pinOwner.get(mainPinId)!
    const pairPlacement = placements[pairChipId]
    const mainPlacement = placements[mainChipId]
    if (!pairPlacement || !mainPlacement) continue

    const pairPin = problem.chipPinMap[chipSidePinId]!
    const mainPin = problem.chipPinMap[mainPinId]!
    const pairPinY =
      pairPlacement.y +
      rotatePinOffset(pairPin.offset, pairPlacement.ccwRotationDegrees).y
    const mainPinY =
      mainPlacement.y +
      rotatePinOffset(mainPin.offset, mainPlacement.ccwRotationDegrees).y
    if (Math.abs(pairPinY - mainPinY) > 1e-6) continue

    for (const chipId of pairChipIds) {
      placements[chipId]!.y -= DIRECT_PASSIVE_VERTICAL_OFFSET
    }
  }
}
