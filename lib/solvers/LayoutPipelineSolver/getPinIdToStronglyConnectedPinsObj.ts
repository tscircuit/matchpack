import type { ChipPin, InputProblem, PinId } from "lib/types/InputProblem"

export const getPinIdToStronglyConnectedPinsObj = (
  inputProblem: InputProblem,
): Record<PinId, ChipPin[]> => {
  const pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]> = {}
  const pinIds = Object.keys(inputProblem.chipPinMap)
  const pinIndex = new Map(pinIds.map((pinId, index) => [pinId, index]))
  const forwardNeighbors = new Map<number, Set<number>>()

  for (const [key, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    // Check every split so hyphens within pin IDs keep their existing meaning.
    for (
      let separator = key.indexOf("-");
      separator !== -1;
      separator = key.indexOf("-", separator + 1)
    ) {
      const first = pinIndex.get(key.slice(0, separator))
      const second = pinIndex.get(key.slice(separator + 1))
      if (first === undefined || second === undefined || first === second) {
        continue
      }
      const lower = Math.min(first, second)
      const upper = Math.max(first, second)
      if (!forwardNeighbors.has(lower)) forwardNeighbors.set(lower, new Set())
      forwardNeighbors.get(lower)!.add(upper)
    }
  }

  // Retain the original pair traversal and neighbor insertion order.
  for (let i = 0; i < pinIds.length; i++) {
    const neighbors = forwardNeighbors.get(i)
    if (!neighbors) continue
    for (const j of [...neighbors].sort((a, b) => a - b)) {
      const pinId1 = pinIds[i]!
      const pinId2 = pinIds[j]!
      pinIdToStronglyConnectedPins[pinId1] ??= []
      pinIdToStronglyConnectedPins[pinId2] ??= []
      pinIdToStronglyConnectedPins[pinId1].push(
        inputProblem.chipPinMap[pinId2]!,
      )
      pinIdToStronglyConnectedPins[pinId2].push(
        inputProblem.chipPinMap[pinId1]!,
      )
    }
  }
  return pinIdToStronglyConnectedPins
}
