import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  PinId,
} from "../../types/InputProblem"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

export type ChipConnectedPullUpRcNetwork = {
  mainChipId: ChipId
  mainPinId: PinId
  resistorChipId: ChipId
  resistorMainPinId: PinId
  railPinId: PinId
  capacitorChipId: ChipId
  capacitorMainPinId: PinId
  groundPinId: PinId
}

type ConnectedTwoPinChip = {
  chip: Chip
  connectedPinId: PinId
  outerPinId: PinId
}

type ConnectivityContext = {
  inputProblem: InputProblem
  pinOwnerMap: Map<PinId, Chip>
  connectedPinsByPinId: Record<PinId, ChipPin[]>
}

const TWO_PIN_COMPONENT_PIN_COUNT = 2

const pinConnectsToGround = (
  { pinId }: { pinId: PinId },
  { inputProblem }: ConnectivityContext,
): boolean => {
  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (!net.isGround) continue
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) return true
  }
  return false
}

const pinConnectsToPositiveVoltage = (
  { pinId }: { pinId: PinId },
  { inputProblem }: ConnectivityContext,
): boolean => {
  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (!net.isPositiveVoltageSource) continue
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) return true
  }
  return false
}

const getConnectedTwoPinChips = (
  { mainChipId, mainPinId }: { mainChipId: ChipId; mainPinId: PinId },
  context: ConnectivityContext,
): ConnectedTwoPinChip[] => {
  const connectedChips: ConnectedTwoPinChip[] = []

  for (const connectedPin of context.connectedPinsByPinId[mainPinId] ?? []) {
    const chip = context.pinOwnerMap.get(connectedPin.pinId)
    if (!chip || chip.chipId === mainChipId) continue
    if (chip.fixedPosition) continue
    if (chip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
    const outerPinId = chip.pins.find((pinId) => pinId !== connectedPin.pinId)
    if (!outerPinId) continue
    connectedChips.push({
      chip,
      connectedPinId: connectedPin.pinId,
      outerPinId,
    })
  }

  return connectedChips
}

export const getChipConnectedPullUpRcNetworks = (
  inputProblem: InputProblem,
): ChipConnectedPullUpRcNetwork[] => {
  const context: ConnectivityContext = {
    inputProblem,
    pinOwnerMap: createPinOwnerMap(inputProblem),
    connectedPinsByPinId: getPinIdToStronglyConnectedPinsObj(inputProblem),
  }
  const pullUpRcNetworks: ChipConnectedPullUpRcNetwork[] = []

  for (const mainChip of Object.values(inputProblem.chipMap)) {
    if (mainChip.pins.length <= TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (mainChip.isCrystal) continue

    for (const mainPinId of mainChip.pins) {
      const connectedChips = getConnectedTwoPinChips(
        { mainChipId: mainChip.chipId, mainPinId },
        context,
      )
      const pullUpResistors = connectedChips.filter(
        ({ chip, outerPinId }) =>
          chip.isResistor &&
          pinConnectsToPositiveVoltage({ pinId: outerPinId }, context),
      )
      const groundedCapacitors = connectedChips.filter(
        ({ chip, outerPinId }) =>
          chip.isCapacitor &&
          pinConnectsToGround({ pinId: outerPinId }, context),
      )
      if (pullUpResistors.length !== 1 || groundedCapacitors.length !== 1) {
        continue
      }

      const pullUpResistor = pullUpResistors[0]!
      const groundedCapacitor = groundedCapacitors[0]!
      pullUpRcNetworks.push({
        mainChipId: mainChip.chipId,
        mainPinId,
        resistorChipId: pullUpResistor.chip.chipId,
        resistorMainPinId: pullUpResistor.connectedPinId,
        railPinId: pullUpResistor.outerPinId,
        capacitorChipId: groundedCapacitor.chip.chipId,
        capacitorMainPinId: groundedCapacitor.connectedPinId,
        groundPinId: groundedCapacitor.outerPinId,
      })
    }
  }

  return pullUpRcNetworks
}
