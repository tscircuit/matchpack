import type { ChipId, InputProblem, PinId } from "../../types/InputProblem"
import {
  getChipPinConnectedTwoPinComponentGroups,
  pinConnectsToGround,
  pinConnectsToPositiveVoltage,
} from "../../utils/getChipPinConnectedTwoPinComponents"

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

export const getChipConnectedPowerFilters = (
  inputProblem: InputProblem,
): ChipConnectedPowerFilter[] => {
  const powerFilters: ChipConnectedPowerFilter[] = []

  for (const group of getChipPinConnectedTwoPinComponentGroups(inputProblem)) {
    const capacitors = group.components.filter(
      ({ chip, outerPinId }) =>
        chip.isCapacitor && pinConnectsToGround(inputProblem, outerPinId),
    )
    const railComponents = group.components.filter(
      ({ chip, outerPinId }) =>
        !chip.isCapacitor &&
        !chip.isResistor &&
        !chip.isCrystal &&
        !chip.isTestPoint &&
        pinConnectsToPositiveVoltage(inputProblem, outerPinId),
    )
    if (capacitors.length !== 1 || railComponents.length !== 1) continue

    const capacitor = capacitors[0]!
    const railComponent = railComponents[0]!
    powerFilters.push({
      mainChipId: group.mainChipId,
      mainPinId: group.mainPinId,
      railComponentChipId: railComponent.chip.chipId,
      railComponentMainPinId: railComponent.connectedPinId,
      railPinId: railComponent.outerPinId,
      capacitorChipId: capacitor.chip.chipId,
      capacitorMainPinId: capacitor.connectedPinId,
      groundPinId: capacitor.outerPinId,
    })
  }

  return powerFilters
}
