import type { Chip, ChipId, InputProblem, PinId } from "../types/InputProblem"
import { getPinIdToStronglyConnectedPinsObj } from "../solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { createPinOwnerMap } from "./createPinOwnerMap"

const TWO_PIN_COMPONENT_PIN_COUNT = 2

export type ChipPinConnectedTwoPinComponent = {
  chip: Chip
  connectedPinId: PinId
  outerPinId: PinId
}

export type ChipPinConnectedTwoPinComponentGroup = {
  mainChipId: ChipId
  mainPinId: PinId
  components: ChipPinConnectedTwoPinComponent[]
}

export const pinConnectsToGround = (
  inputProblem: InputProblem,
  pinId: PinId,
): boolean => {
  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (!net.isGround) continue
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) return true
  }
  return false
}

export const pinConnectsToPositiveVoltage = (
  inputProblem: InputProblem,
  pinId: PinId,
): boolean => {
  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (!net.isPositiveVoltageSource) continue
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) return true
  }
  return false
}

/**
 * Groups movable two-pin components by the exact multi-pin chip pin they are
 * strongly connected to. This intentionally does not group by global nets such
 * as 3V3 or GND, which may span unrelated parts of a schematic.
 */
export const getChipPinConnectedTwoPinComponentGroups = (
  inputProblem: InputProblem,
): ChipPinConnectedTwoPinComponentGroup[] => {
  const pinOwnerMap = createPinOwnerMap(inputProblem)
  const connectedPinsByPinId = getPinIdToStronglyConnectedPinsObj(inputProblem)
  const groups: ChipPinConnectedTwoPinComponentGroup[] = []

  for (const mainChip of Object.values(inputProblem.chipMap)) {
    if (mainChip.pins.length <= TWO_PIN_COMPONENT_PIN_COUNT) continue
    if (mainChip.isCrystal) continue

    for (const mainPinId of mainChip.pins) {
      const components: ChipPinConnectedTwoPinComponent[] = []

      for (const connectedPin of connectedPinsByPinId[mainPinId] ?? []) {
        const chip = pinOwnerMap.get(connectedPin.pinId)
        if (!chip || chip.chipId === mainChip.chipId) continue
        if (chip.fixedPosition) continue
        if (chip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
        const outerPinId = chip.pins.find(
          (pinId) => pinId !== connectedPin.pinId,
        )
        if (!outerPinId) continue
        components.push({
          chip,
          connectedPinId: connectedPin.pinId,
          outerPinId,
        })
      }

      if (components.length === 0) continue
      groups.push({
        mainChipId: mainChip.chipId,
        mainPinId,
        components,
      })
    }
  }

  return groups
}
