import type { ChipId, InputProblem, NetId } from "../../types/InputProblem"
import type { Side } from "../../types/Side"

export const getPositiveRailPin = (
  {
    chipId,
    side,
    railNetId,
  }: { chipId: ChipId; side?: Side; railNetId?: NetId | null },
  inputProblem: InputProblem,
) => {
  const chip = inputProblem.chipMap[chipId]
  const pins = chip?.pins
    .filter((pinId) => !side || inputProblem.chipPinMap[pinId]?.side === side)
    .map((pinId) => inputProblem.chipPinMap[pinId])

  if (railNetId) {
    const matchingRailPin = pins?.find(
      (pin) => pin && inputProblem.netConnMap[`${pin.pinId}-${railNetId}`],
    )
    if (matchingRailPin) return matchingRailPin
  }

  return pins?.find(
    (pin) =>
      pin &&
      Object.values(inputProblem.netMap).some(
        (net) =>
          net.isPositiveVoltageSource &&
          inputProblem.netConnMap[`${pin.pinId}-${net.netId}`],
      ),
  )
}
