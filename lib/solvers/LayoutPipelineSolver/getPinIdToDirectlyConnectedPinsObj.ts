import type { ChipPin, InputProblem, PinId } from "lib/types/InputProblem"

export const getPinIdToDirectlyConnectedPinsObj = (
  inputProblem: InputProblem,
): Record<PinId, ChipPin[]> => {
  const pinIdToDirectlyConnectedPins: Record<PinId, ChipPin[]> = {}
  const pinIds = Object.keys(inputProblem.chipPinMap)
  for (let i = 0; i < pinIds.length; i++) {
    for (let j = i + 1; j < pinIds.length; j++) {
      const pinId1 = pinIds[i]!
      const pinId2 = pinIds[j]!
      if (
        inputProblem.pinStrongConnMap[`${pinId1}-${pinId2}`] ||
        inputProblem.pinStrongConnMap[`${pinId2}-${pinId1}`]
      ) {
        pinIdToDirectlyConnectedPins[pinId1] ??= []
        pinIdToDirectlyConnectedPins[pinId2] ??= []
        pinIdToDirectlyConnectedPins[pinId1].push(
          inputProblem.chipPinMap[pinId2]!,
        )
        pinIdToDirectlyConnectedPins[pinId2].push(
          inputProblem.chipPinMap[pinId1]!,
        )
      }
    }
  }
  return pinIdToDirectlyConnectedPins
}
