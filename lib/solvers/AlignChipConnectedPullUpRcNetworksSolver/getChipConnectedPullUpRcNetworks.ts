import type { ChipId, InputProblem, PinId } from "../../types/InputProblem"
import {
  getChipPinConnectedTwoPinComponentGroups,
  pinConnectsToGround,
  pinConnectsToPositiveVoltage,
} from "../../utils/getChipPinConnectedTwoPinComponents"

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

export const getChipConnectedPullUpRcNetworks = (
  inputProblem: InputProblem,
): ChipConnectedPullUpRcNetwork[] => {
  const pullUpRcNetworks: ChipConnectedPullUpRcNetwork[] = []

  for (const group of getChipPinConnectedTwoPinComponentGroups(inputProblem)) {
    const pullUpResistors = group.components.filter(
      ({ chip, outerPinId }) =>
        chip.isResistor &&
        pinConnectsToPositiveVoltage(inputProblem, outerPinId),
    )
    const groundedCapacitors = group.components.filter(
      ({ chip, outerPinId }) =>
        chip.isCapacitor && pinConnectsToGround(inputProblem, outerPinId),
    )
    if (pullUpResistors.length !== 1 || groundedCapacitors.length !== 1) {
      continue
    }

    const pullUpResistor = pullUpResistors[0]!
    const groundedCapacitor = groundedCapacitors[0]!
    pullUpRcNetworks.push({
      mainChipId: group.mainChipId,
      mainPinId: group.mainPinId,
      resistorChipId: pullUpResistor.chip.chipId,
      resistorMainPinId: pullUpResistor.connectedPinId,
      railPinId: pullUpResistor.outerPinId,
      capacitorChipId: groundedCapacitor.chip.chipId,
      capacitorMainPinId: groundedCapacitor.connectedPinId,
      groundPinId: groundedCapacitor.outerPinId,
    })
  }

  return pullUpRcNetworks
}
