import type { ChipId, InputProblem, PinId } from "../../types/InputProblem"

const getStronglyConnectedPins = (
  pinId: PinId,
  inputProblem: InputProblem,
): PinId[] => {
  const connectedPins = new Set<PinId>()
  for (const [connection, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [pinA, pinB] = connection.split("-") as [PinId, PinId]
    if (pinA === pinId) connectedPins.add(pinB)
    if (pinB === pinId) connectedPins.add(pinA)
  }
  return [...connectedPins]
}

const pinIsOnGroundNet = (pinId: PinId, inputProblem: InputProblem): boolean =>
  Object.entries(inputProblem.netConnMap).some(([connection, connected]) => {
    if (!connected || !connection.startsWith(`${pinId}-`)) return false
    const netId = connection.slice(pinId.length + 1)
    return inputProblem.netMap[netId]?.isGround === true
  })

export const findGroundedLoadPairPartitions = (
  inputProblem: InputProblem,
  excludedChipIds: Set<ChipId>,
): ChipId[][] => {
  const pinOwner = new Map<PinId, ChipId>()
  for (const chip of Object.values(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinOwner.set(pinId, chip.chipId)
  }

  const pairs: ChipId[][] = []
  const pairedChipIds = new Set<ChipId>()
  for (const nearChip of Object.values(inputProblem.chipMap)) {
    if (
      excludedChipIds.has(nearChip.chipId) ||
      pairedChipIds.has(nearChip.chipId) ||
      nearChip.fixedPosition ||
      nearChip.pins.length !== 2
    ) {
      continue
    }

    for (const chipSidePinId of nearChip.pins) {
      const mainChip = getStronglyConnectedPins(chipSidePinId, inputProblem)
        .map((pinId) => inputProblem.chipMap[pinOwner.get(pinId)!])
        .find((chip) => chip && chip.pins.length > 2)
      if (!mainChip) continue

      const internalPinId = nearChip.pins.find(
        (pinId) => pinId !== chipSidePinId,
      )!
      const farChip = getStronglyConnectedPins(internalPinId, inputProblem)
        .map((pinId) => inputProblem.chipMap[pinOwner.get(pinId)!])
        .find(
          (chip) =>
            chip && chip.chipId !== nearChip.chipId && chip.pins.length === 2,
        )
      if (
        !farChip ||
        excludedChipIds.has(farChip.chipId) ||
        pairedChipIds.has(farChip.chipId) ||
        farChip.fixedPosition
      ) {
        continue
      }

      const farInternalPinId = farChip.pins.find((pinId) =>
        getStronglyConnectedPins(pinId, inputProblem).some(
          (connectedPinId) => pinOwner.get(connectedPinId) === nearChip.chipId,
        ),
      )
      const groundPinId = farChip.pins.find(
        (pinId) => pinId !== farInternalPinId,
      )
      if (
        !farInternalPinId ||
        !groundPinId ||
        !pinIsOnGroundNet(groundPinId, inputProblem)
      ) {
        continue
      }

      pairs.push([nearChip.chipId, farChip.chipId])
      pairedChipIds.add(nearChip.chipId)
      pairedChipIds.add(farChip.chipId)
      break
    }
  }

  return pairs
}
