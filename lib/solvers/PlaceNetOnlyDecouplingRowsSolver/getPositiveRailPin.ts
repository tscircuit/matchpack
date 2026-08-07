import type { ChipId, InputProblem } from "../../types/InputProblem"
import type { Side } from "../../types/Side"

export const getPositiveRailPin = (
  { chipId, side }: { chipId: ChipId; side?: Side },
  inputProblem: InputProblem,
) => {
  const chip = inputProblem.chipMap[chipId]
  return chip?.pins
    .filter((pinId) => !side || inputProblem.chipPinMap[pinId]?.side === side)
    .map((pinId) => inputProblem.chipPinMap[pinId])
    .find(
      (pin) =>
        pin &&
        Object.values(inputProblem.netMap).some(
          (net) =>
            net.isPositiveVoltageSource &&
            inputProblem.netConnMap[`${pin.pinId}-${net.netId}`],
        ),
    )
}
