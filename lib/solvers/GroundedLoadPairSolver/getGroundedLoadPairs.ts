import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  NetId,
  PinId,
} from "../../types/InputProblem"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { createPinOwnerMap } from "../../utils/create-pin-owner-map"

export type GroundedLoadPair = {
  upperChip: Chip
  lowerChip: Chip
  mainChipId?: ChipId
  mainPinId?: PinId
  upperOuterPinId: PinId
  upperInnerPinId: PinId
  lowerInnerPinId: PinId
  groundPinId: PinId
}

type ConnectivityContext = {
  inputProblem: InputProblem
  pinOwnerMap: Map<PinId, Chip>
  connectedPinsByPinId: Record<PinId, ChipPin[]>
  pairedChipIds: Set<ChipId>
}

const TWO_PIN_COMPONENT_PIN_COUNT = 2

// Read direct neighbors from the pipeline's canonical connectivity map.
const getStronglyConnectedPinIds = ({
  connectedPinsByPinId,
  pinId,
}: {
  connectedPinsByPinId: Record<PinId, ChipPin[]>
  pinId: PinId
}): PinId[] =>
  (connectedPinsByPinId[pinId] ?? []).map((connectedPin) => connectedPin.pinId)

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
  // Match main chip -> two-pin component -> two-pin component -> ground.
  const { inputProblem, pinOwnerMap, connectedPinsByPinId, pairedChipIds } =
    context
  for (const upperOuterPinId of upperChip.pins) {
    const mainPinId = getStronglyConnectedPinIds({
      connectedPinsByPinId,
      pinId: upperOuterPinId,
    }).find((pinId) => {
      const chip = pinOwnerMap.get(pinId)
      if (!chip) return false
      return chip.pins.length > TWO_PIN_COMPONENT_PIN_COUNT && !chip.isCrystal
    })
    if (!mainPinId) continue
    const mainChip = pinOwnerMap.get(mainPinId)
    if (!mainChip) continue

    const upperInnerPinId = upperChip.pins.find(
      (pinId) => pinId !== upperOuterPinId,
    )
    if (!upperInnerPinId) continue

    const lowerChip = getStronglyConnectedPinIds({
      connectedPinsByPinId,
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
      getStronglyConnectedPinIds({ connectedPinsByPinId, pinId }).some(
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
      mainChipId: mainChip.chipId,
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
  // Match positive rail -> two-pin component -> private net -> component -> ground.
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
  // A private two-pin net prevents grouping a branched circuit as one load chain.
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
  const pinOwnerMap = createPinOwnerMap(inputProblem)
  const groundedLoadPairs: GroundedLoadPair[] = []
  const pairedChipIds = new Set<ChipId>()
  const connectedPinsByPinId = getPinIdToStronglyConnectedPinsObj(inputProblem)
  const context = {
    inputProblem,
    pinOwnerMap,
    connectedPinsByPinId,
    pairedChipIds,
  }

  // Chip-anchored chains take priority over standalone rail chains.
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
