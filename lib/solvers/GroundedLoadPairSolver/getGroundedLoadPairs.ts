import type {
  Chip,
  ChipId,
  InputProblem,
  NetId,
  PinId,
} from "../../types/InputProblem"

export type GroundedLoadPair = {
  upperChip: Chip
  lowerChip: Chip
  mainPinId?: PinId
  upperOuterPinId: PinId
  upperInnerPinId: PinId
  lowerInnerPinId: PinId
  groundPinId: PinId
}

type ConnectivityContext = {
  inputProblem: InputProblem
  pinOwnerMap: Map<PinId, Chip>
  pairedChipIds: Set<ChipId>
}

const TWO_PIN_COMPONENT_PIN_COUNT = 2

const getStronglyConnectedPinIds = ({
  inputProblem,
  pinId,
}: {
  inputProblem: InputProblem
  pinId: PinId
}): PinId[] => {
  const connectedPinIds: PinId[] = []
  for (const otherPinId of Object.keys(inputProblem.chipPinMap)) {
    const forwardConnection = `${pinId}-${otherPinId}` as const
    const reverseConnection = `${otherPinId}-${pinId}` as const
    if (
      inputProblem.pinStrongConnMap[forwardConnection] ||
      inputProblem.pinStrongConnMap[reverseConnection]
    ) {
      connectedPinIds.push(otherPinId)
    }
  }
  return connectedPinIds
}

const getNetIdsForPin = ({
  inputProblem,
  pinId,
}: {
  inputProblem: InputProblem
  pinId: PinId
}): NetId[] => {
  const netIds: NetId[] = []
  for (const netId of Object.keys(inputProblem.netMap)) {
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) netIds.push(netId)
  }
  return netIds
}

const getPinIdsForNet = ({
  inputProblem,
  netId,
}: {
  inputProblem: InputProblem
  netId: NetId
}): PinId[] => {
  const pinIds: PinId[] = []
  for (const pinId of Object.keys(inputProblem.chipPinMap)) {
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) pinIds.push(pinId)
  }
  return pinIds
}

const pinConnectsToGround = ({
  inputProblem,
  pinId,
}: {
  inputProblem: InputProblem
  pinId: PinId
}) =>
  getNetIdsForPin({ inputProblem, pinId }).some(
    (netId) => inputProblem.netMap[netId]?.isGround === true,
  )

const pinConnectsToPositiveVoltage = ({
  inputProblem,
  pinId,
}: {
  inputProblem: InputProblem
  pinId: PinId
}) =>
  getNetIdsForPin({ inputProblem, pinId }).some(
    (netId) => inputProblem.netMap[netId]?.isPositiveVoltageSource === true,
  )

const getChipConnectedPair = (
  upperChip: Chip,
  context: ConnectivityContext,
): GroundedLoadPair | null => {
  const { inputProblem, pinOwnerMap, pairedChipIds } = context
  for (const upperOuterPinId of upperChip.pins) {
    const mainPinId = getStronglyConnectedPinIds({
      inputProblem,
      pinId: upperOuterPinId,
    }).find((pinId) => {
      const chip = pinOwnerMap.get(pinId)
      if (!chip) return false
      return chip.pins.length > TWO_PIN_COMPONENT_PIN_COUNT && !chip.isCrystal
    })
    if (!mainPinId) continue

    const upperInnerPinId = upperChip.pins.find(
      (pinId) => pinId !== upperOuterPinId,
    )
    if (!upperInnerPinId) continue

    const lowerChip = getStronglyConnectedPinIds({
      inputProblem,
      pinId: upperInnerPinId,
    })
      .map((pinId) => pinOwnerMap.get(pinId))
      .find((chip) => {
        if (!chip) return false
        if (chip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) return false
        if (chip.chipId === upperChip.chipId) return false
        if (chip.fixedPosition) return false
        return !pairedChipIds.has(chip.chipId)
      })
    if (!lowerChip) continue

    const lowerInnerPinId = lowerChip.pins.find((pinId) =>
      getStronglyConnectedPinIds({ inputProblem, pinId }).some(
        (connectedPinId) =>
          pinOwnerMap.get(connectedPinId)?.chipId === upperChip.chipId,
      ),
    )
    if (!lowerInnerPinId) continue

    const groundPinId = lowerChip.pins.find(
      (pinId) =>
        pinId !== lowerInnerPinId &&
        pinConnectsToGround({ inputProblem, pinId }),
    )
    if (!groundPinId) continue

    return {
      upperChip,
      lowerChip,
      mainPinId,
      upperOuterPinId,
      upperInnerPinId,
      lowerInnerPinId,
      groundPinId,
    }
  }
  return null
}

const getRailConnectedPair = (
  upperChip: Chip,
  context: ConnectivityContext,
): GroundedLoadPair | null => {
  const { inputProblem, pinOwnerMap, pairedChipIds } = context
  const upperOuterPinId = upperChip.pins.find((pinId) =>
    pinConnectsToPositiveVoltage({ inputProblem, pinId }),
  )
  if (!upperOuterPinId) return null

  const upperInnerPinId = upperChip.pins.find(
    (pinId) => pinId !== upperOuterPinId,
  )
  if (!upperInnerPinId) return null

  const internalNetId = getNetIdsForPin({
    inputProblem,
    pinId: upperInnerPinId,
  }).find((netId) => {
    const net = inputProblem.netMap[netId]
    return !net?.isGround && !net?.isPositiveVoltageSource
  })
  if (!internalNetId) return null

  const internalPinIds = getPinIdsForNet({ inputProblem, netId: internalNetId })
  if (internalPinIds.length !== TWO_PIN_COMPONENT_PIN_COUNT) return null
  const lowerInnerPinId = internalPinIds.find(
    (pinId) => pinId !== upperInnerPinId,
  )
  if (!lowerInnerPinId) return null

  const lowerChip = pinOwnerMap.get(lowerInnerPinId)
  if (!lowerChip) return null
  if (lowerChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) return null
  if (lowerChip.fixedPosition) return null
  if (pairedChipIds.has(lowerChip.chipId)) return null

  const groundPinId = lowerChip.pins.find(
    (pinId) =>
      pinId !== lowerInnerPinId && pinConnectsToGround({ inputProblem, pinId }),
  )
  if (!groundPinId) return null

  return {
    upperChip,
    lowerChip,
    upperOuterPinId,
    upperInnerPinId,
    lowerInnerPinId,
    groundPinId,
  }
}

export const getGroundedLoadPairs = (
  inputProblem: InputProblem,
): GroundedLoadPair[] => {
  const pinOwnerMap = new Map<PinId, Chip>()
  for (const chip of Object.values(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinOwnerMap.set(pinId, chip)
  }

  const groundedLoadPairs: GroundedLoadPair[] = []
  const pairedChipIds = new Set<ChipId>()
  const context = { inputProblem, pinOwnerMap, pairedChipIds }

  // Prefer chip-anchored pairs before considering standalone rail chains.
  for (const upperChip of Object.values(inputProblem.chipMap)) {
    if (upperChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (upperChip.fixedPosition) continue
    if (pairedChipIds.has(upperChip.chipId)) continue

    const groundedLoadPair = getChipConnectedPair(upperChip, context)
    if (!groundedLoadPair) continue
    groundedLoadPairs.push(groundedLoadPair)
    pairedChipIds.add(groundedLoadPair.upperChip.chipId)
    pairedChipIds.add(groundedLoadPair.lowerChip.chipId)
  }

  for (const upperChip of Object.values(inputProblem.chipMap)) {
    if (upperChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (upperChip.fixedPosition) continue
    if (pairedChipIds.has(upperChip.chipId)) continue

    const groundedLoadPair = getRailConnectedPair(upperChip, context)
    if (!groundedLoadPair) continue
    groundedLoadPairs.push(groundedLoadPair)
    pairedChipIds.add(groundedLoadPair.upperChip.chipId)
    pairedChipIds.add(groundedLoadPair.lowerChip.chipId)
  }

  return groundedLoadPairs
}
