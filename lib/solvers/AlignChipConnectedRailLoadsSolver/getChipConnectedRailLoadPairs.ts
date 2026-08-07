import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  PinId,
} from "../../types/InputProblem"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

export type ChipConnectedRailLoadPair = {
  railComponent: Chip
  resistor: Chip
  railPinId: PinId
  railComponentResistorPinId: PinId
  resistorRailComponentPinId: PinId
  resistorMainPinId: PinId
  mainChipId: ChipId
  mainPinId: PinId
}

type ConnectivityContext = {
  inputProblem: InputProblem
  pinOwnerMap: Map<PinId, Chip>
  connectedPinsByPinId: Record<PinId, ChipPin[]>
}

const TWO_PIN_COMPONENT_PIN_COUNT = 2

const getStronglyConnectedPinIds = ({
  connectedPinsByPinId,
  pinId,
}: {
  connectedPinsByPinId: Record<PinId, ChipPin[]>
  pinId: PinId
}): PinId[] =>
  (connectedPinsByPinId[pinId] ?? []).map((connectedPin) => connectedPin.pinId)

const pinConnectsToPositiveVoltage = ({
  inputProblem,
  pinId,
}: {
  inputProblem: InputProblem
  pinId: PinId
}): boolean => {
  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (!net.isPositiveVoltageSource) continue
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) return true
  }
  return false
}

const getRailLoadPair = (
  resistor: Chip,
  context: ConnectivityContext,
): ChipConnectedRailLoadPair | null => {
  const { inputProblem, pinOwnerMap, connectedPinsByPinId } = context

  for (const resistorMainPinId of resistor.pins) {
    const mainPinId = getStronglyConnectedPinIds({
      connectedPinsByPinId,
      pinId: resistorMainPinId,
    }).find((pinId) => {
      const chip = pinOwnerMap.get(pinId)
      if (!chip) return false
      return chip.pins.length > TWO_PIN_COMPONENT_PIN_COUNT && !chip.isCrystal
    })
    if (!mainPinId) continue
    const mainChip = pinOwnerMap.get(mainPinId)
    if (!mainChip) continue

    const resistorRailComponentPinId = resistor.pins.find(
      (pinId) => pinId !== resistorMainPinId,
    )
    if (!resistorRailComponentPinId) continue
    const railComponentResistorPinId = getStronglyConnectedPinIds({
      connectedPinsByPinId,
      pinId: resistorRailComponentPinId,
    }).find((pinId) => {
      const chip = pinOwnerMap.get(pinId)
      if (!chip) return false
      if (chip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) return false
      return !chip.isResistor && !chip.isCapacitor && !chip.fixedPosition
    })
    if (!railComponentResistorPinId) continue
    const railComponent = pinOwnerMap.get(railComponentResistorPinId)
    if (!railComponent) continue
    const railPinId = railComponent.pins.find(
      (pinId) =>
        pinId !== railComponentResistorPinId &&
        pinConnectsToPositiveVoltage({ inputProblem, pinId }),
    )
    if (!railPinId) continue

    return {
      railComponent,
      resistor,
      railPinId,
      railComponentResistorPinId,
      resistorRailComponentPinId,
      resistorMainPinId,
      mainChipId: mainChip.chipId,
      mainPinId,
    }
  }
  return null
}

export const getChipConnectedRailLoadPairs = (
  inputProblem: InputProblem,
): ChipConnectedRailLoadPair[] => {
  const context = {
    inputProblem,
    pinOwnerMap: createPinOwnerMap(inputProblem),
    connectedPinsByPinId: getPinIdToStronglyConnectedPinsObj(inputProblem),
  }
  const railLoadPairs: ChipConnectedRailLoadPair[] = []

  for (const chip of Object.values(inputProblem.chipMap)) {
    if (!chip.isResistor || chip.fixedPosition) continue
    const railLoadPair = getRailLoadPair(chip, context)
    if (railLoadPair) railLoadPairs.push(railLoadPair)
  }
  return railLoadPairs
}
