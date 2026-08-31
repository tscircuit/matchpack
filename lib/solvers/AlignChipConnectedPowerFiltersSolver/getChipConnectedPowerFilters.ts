import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  PinId,
} from "../../types/InputProblem"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

export type ChipConnectedPowerFilter = {
  mainChipId: ChipId
  mainPinId: PinId
  railComponentChipId: ChipId
  railComponentMainPinId: PinId
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

export const getChipConnectedPowerFilters = (
  inputProblem: InputProblem,
): ChipConnectedPowerFilter[] => {
  const context: ConnectivityContext = {
    inputProblem,
    pinOwnerMap: createPinOwnerMap(inputProblem),
    connectedPinsByPinId: getPinIdToStronglyConnectedPinsObj(inputProblem),
  }
  const powerFilters: ChipConnectedPowerFilter[] = []

  for (const mainChip of Object.values(inputProblem.chipMap)) {
    if (mainChip.pins.length <= TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (mainChip.isCrystal) continue

    for (const mainPinId of mainChip.pins) {
      const connectedChips = getConnectedTwoPinChips(
        { mainChipId: mainChip.chipId, mainPinId },
        context,
      )
      const capacitors = connectedChips.filter(
        ({ chip, outerPinId }) =>
          chip.isCapacitor &&
          pinConnectsToGround({ pinId: outerPinId }, context),
      )
      const railComponents = connectedChips.filter(
        ({ chip, outerPinId }) =>
          !chip.isCapacitor &&
          !chip.isResistor &&
          !chip.isCrystal &&
          !chip.isTestPoint &&
          pinConnectsToPositiveVoltage({ pinId: outerPinId }, context),
      )
      if (capacitors.length !== 1 || railComponents.length !== 1) continue

      const capacitor = capacitors[0]!
      const railComponent = railComponents[0]!
      powerFilters.push({
        mainChipId: mainChip.chipId,
        mainPinId,
        railComponentChipId: railComponent.chip.chipId,
        railComponentMainPinId: railComponent.connectedPinId,
        railPinId: railComponent.outerPinId,
        capacitorChipId: capacitor.chip.chipId,
        capacitorMainPinId: capacitor.connectedPinId,
        groundPinId: capacitor.outerPinId,
      })
    }
  }

  return powerFilters
}
