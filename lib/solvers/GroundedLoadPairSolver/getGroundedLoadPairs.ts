import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  NetId,
  PinId,
} from "../../types/InputProblem"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"

export type GroundedLoadPair = {
  upperChip: Chip
  lowerChip: Chip
  mainChipId?: ChipId
  mainPinId?: PinId
  upperOuterPinId: PinId
  upperInnerPinId: PinId
  lowerInnerPinId: PinId
  groundPinId: PinId
  groundNetId: NetId
  isStandaloneSignalChain?: boolean
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

const getGroundConnection = ({
  lowerChip,
  lowerInnerPinId,
  inputProblem,
}: {
  lowerChip: Chip
  lowerInnerPinId: PinId
  inputProblem: InputProblem
}): Pick<GroundedLoadPair, "groundPinId" | "groundNetId"> | null => {
  for (const groundPinId of lowerChip.pins) {
    if (groundPinId === lowerInnerPinId) continue
    const groundNetId = getNetIdsForPin({
      inputProblem,
      pinId: groundPinId,
    }).find((netId) => inputProblem.netMap[netId]?.isGround === true)
    if (groundNetId) return { groundPinId, groundNetId }
  }
  return null
}

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

const getDirectlyConnectedGroundedLowerChip = (
  { upperInnerPinId }: { upperInnerPinId: PinId },
  ctx: ConnectivityContext,
): Pick<
  GroundedLoadPair,
  "lowerChip" | "lowerInnerPinId" | "groundPinId" | "groundNetId"
> | null => {
  const { inputProblem, pinOwnerMap, connectedPinsByPinId, pairedChipIds } = ctx
  for (const lowerInnerPinId of getStronglyConnectedPinIds({
    connectedPinsByPinId,
    pinId: upperInnerPinId,
  })) {
    const lowerChip = pinOwnerMap.get(lowerInnerPinId)
    if (!lowerChip) continue
    if (lowerChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (lowerChip.fixedPosition) continue
    if (pairedChipIds.has(lowerChip.chipId)) continue
    const groundConnection = getGroundConnection({
      lowerChip,
      lowerInnerPinId,
      inputProblem,
    })
    if (!groundConnection) continue
    return { lowerChip, lowerInnerPinId, ...groundConnection }
  }
  return null
}

const getChipConnectedPair = (
  upperChip: Chip,
  ctx: ConnectivityContext,
): GroundedLoadPair | null => {
  // Match main chip -> two-pin component -> two-pin component -> ground.
  const { inputProblem, pinOwnerMap, connectedPinsByPinId, pairedChipIds } = ctx
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

    const groundConnection = getGroundConnection({
      lowerChip,
      lowerInnerPinId,
      inputProblem,
    })
    if (!groundConnection) continue

    return {
      upperChip,
      lowerChip,
      mainChipId: mainChip.chipId,
      mainPinId,
      upperOuterPinId,
      upperInnerPinId,
      lowerInnerPinId,
      ...groundConnection,
    }
  }
  return null
}

const getRailConnectedPair = (
  upperChip: Chip,
  ctx: ConnectivityContext,
): GroundedLoadPair | null => {
  // Match positive rail -> two-pin component -> private net -> component -> ground.
  const { inputProblem, pinOwnerMap, pairedChipIds } = ctx
  const upperOuterPinId = upperChip.pins.find((pinId) =>
    pinConnectsToPositiveVoltage({ inputProblem, pinId }),
  )
  if (!upperOuterPinId) return null

  const upperInnerPinId = upperChip.pins.find(
    (pinId) => pinId !== upperOuterPinId,
  )
  if (!upperInnerPinId) return null

  const directlyConnectedLowerChip = getDirectlyConnectedGroundedLowerChip(
    { upperInnerPinId },
    ctx,
  )
  if (directlyConnectedLowerChip) {
    return {
      upperChip,
      upperOuterPinId,
      upperInnerPinId,
      ...directlyConnectedLowerChip,
    }
  }

  const internalNetId = getNetIdsForPin({
    inputProblem,
    pinId: upperInnerPinId,
  }).find((netId) => {
    const net = inputProblem.netMap[netId]
    return !net?.isGround && !net?.isPositiveVoltageSource
  })
  if (!internalNetId) return null

  const internalPinIds = getPinIdsForNet({
    inputProblem,
    netId: internalNetId,
  })
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

  const groundConnection = getGroundConnection({
    lowerChip,
    lowerInnerPinId,
    inputProblem,
  })
  if (!groundConnection) return null

  return {
    upperChip,
    lowerChip,
    upperOuterPinId,
    upperInnerPinId,
    lowerInnerPinId,
    ...groundConnection,
  }
}

const getSignalConnectedPair = (
  upperChip: Chip,
  ctx: ConnectivityContext,
): GroundedLoadPair | null => {
  const { inputProblem } = ctx
  for (const upperOuterPinId of upperChip.pins) {
    const hasStandaloneSignalNet = getNetIdsForPin({
      inputProblem,
      pinId: upperOuterPinId,
    }).some((netId) => {
      const net = inputProblem.netMap[netId]
      if (net?.isGround || net?.isPositiveVoltageSource) return false
      return getPinIdsForNet({ inputProblem, netId }).length === 1
    })
    if (!hasStandaloneSignalNet) continue

    const upperInnerPinId = upperChip.pins.find(
      (pinId) => pinId !== upperOuterPinId,
    )
    if (!upperInnerPinId) continue

    const directlyConnectedLowerChip = getDirectlyConnectedGroundedLowerChip(
      { upperInnerPinId },
      ctx,
    )
    if (!directlyConnectedLowerChip) continue

    return {
      upperChip,
      upperOuterPinId,
      upperInnerPinId,
      ...directlyConnectedLowerChip,
      isStandaloneSignalChain: true,
    }
  }
  return null
}

export const getGroundedLoadPairs = (
  inputProblem: InputProblem,
): GroundedLoadPair[] => {
  const pinOwnerMap = createPinOwnerMap(inputProblem)
  const groundedLoadPairs: GroundedLoadPair[] = []
  const pairedChipIds = new Set<ChipId>()
  const connectedPinsByPinId = getPinIdToStronglyConnectedPinsObj(inputProblem)
  const ctx = {
    inputProblem,
    pinOwnerMap,
    connectedPinsByPinId,
    pairedChipIds,
  }

  // Chip-anchored chains take priority over standalone rail chains.
  for (const upperChip of Object.values(inputProblem.chipMap)) {
    if (upperChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (upperChip.isCrystal) continue
    if (upperChip.fixedPosition) continue
    if (pairedChipIds.has(upperChip.chipId)) continue

    const groundedLoadPair = getChipConnectedPair(upperChip, ctx)
    if (!groundedLoadPair) continue
    groundedLoadPairs.push(groundedLoadPair)
    pairedChipIds.add(groundedLoadPair.upperChip.chipId)
    pairedChipIds.add(groundedLoadPair.lowerChip.chipId)
  }

  for (const upperChip of Object.values(inputProblem.chipMap)) {
    if (upperChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (upperChip.isCrystal) continue
    if (upperChip.fixedPosition) continue
    if (pairedChipIds.has(upperChip.chipId)) continue

    const groundedLoadPair = getSignalConnectedPair(upperChip, ctx)
    if (!groundedLoadPair) continue
    groundedLoadPairs.push(groundedLoadPair)
    pairedChipIds.add(groundedLoadPair.upperChip.chipId)
    pairedChipIds.add(groundedLoadPair.lowerChip.chipId)
  }

  for (const upperChip of Object.values(inputProblem.chipMap)) {
    if (upperChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (upperChip.isCrystal) continue
    if (upperChip.fixedPosition) continue
    if (pairedChipIds.has(upperChip.chipId)) continue

    const groundedLoadPair = getRailConnectedPair(upperChip, ctx)
    if (!groundedLoadPair) continue
    groundedLoadPairs.push(groundedLoadPair)
    pairedChipIds.add(groundedLoadPair.upperChip.chipId)
    pairedChipIds.add(groundedLoadPair.lowerChip.chipId)
  }

  return groundedLoadPairs
}
