import type { ChipId, InputProblem, PinId } from "../../types/InputProblem"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

/** Every series element must have one entry pin and one exit pin. */
const TWO_PIN_COMPONENT_PIN_COUNT = 2

export type SeriesBranchComponent = {
  chipId: ChipId
  /** Pin facing the main chip. */
  nearPinId: PinId
  /** Pin facing the shared outer connection. */
  farPinId: PinId
}

export type ParallelSeriesBranchGroup = {
  mainChipId: ChipId
  mainPinIds: [PinId, PinId]
  branches: [SeriesBranchComponent[], SeriesBranchComponent[]]
}

type ChipConnection = {
  selfPinId: PinId
  otherPinId: PinId
  otherChipId: ChipId
}

const buildConnectionsByChip = (
  inputProblem: InputProblem,
): Map<ChipId, ChipConnection[]> => {
  const pinOwnerMap = new Map<PinId, ChipId>()
  for (const chip of Object.values(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinOwnerMap.set(pinId, chip.chipId)
  }

  const connectedPinsByPinId = getPinIdToStronglyConnectedPinsObj(inputProblem)
  const connectionsByChip = new Map<ChipId, ChipConnection[]>()
  for (const [pinId, connectedPins] of Object.entries(connectedPinsByPinId)) {
    const chipId = pinOwnerMap.get(pinId)
    if (!chipId) continue
    for (const connectedPin of connectedPins) {
      const otherChipId = pinOwnerMap.get(connectedPin.pinId)
      if (!otherChipId || otherChipId === chipId) continue
      const connections = connectionsByChip.get(chipId) ?? []
      connections.push({
        selfPinId: pinId,
        otherPinId: connectedPin.pinId,
        otherChipId,
      })
      connectionsByChip.set(chipId, connections)
    }
  }
  return connectionsByChip
}

const findTwoPinComponentPath = ({
  inputProblem,
  connectionsByChip,
  mainChipId,
  startChipId,
  endChipId,
}: {
  inputProblem: InputProblem
  connectionsByChip: Map<ChipId, ChipConnection[]>
  mainChipId: ChipId
  startChipId: ChipId
  endChipId: ChipId
}): ChipId[] | null => {
  if (startChipId === endChipId) return null

  const canUseChip = (chipId: ChipId): boolean => {
    const chip = inputProblem.chipMap[chipId]
    return (
      chipId !== mainChipId &&
      chip?.pins.length === TWO_PIN_COMPONENT_PIN_COUNT &&
      !chip.fixedPosition
    )
  }
  if (!canUseChip(startChipId) || !canUseChip(endChipId)) return null

  const queue: ChipId[][] = [[startChipId]]
  const visited = new Set<ChipId>([startChipId])
  while (queue.length > 0) {
    const path = queue.shift()!
    const chipId = path[path.length - 1]!
    if (chipId === endChipId) return path

    for (const connection of connectionsByChip.get(chipId) ?? []) {
      const nextChipId = connection.otherChipId
      if (!canUseChip(nextChipId) || visited.has(nextChipId)) continue
      visited.add(nextChipId)
      queue.push([...path, nextChipId])
    }
  }
  return null
}

/**
 * Validate that `pathChipIds` is a pure series path. Every component must use
 * its two different pins and have exactly the two expected neighbours. This
 * keeps branched or multiply-connected circuits out of the reflow stage.
 */
const getOrderedSeriesComponents = ({
  inputProblem,
  connectionsByChip,
  mainChipId,
  mainPinIds,
  pathChipIds,
}: {
  inputProblem: InputProblem
  connectionsByChip: Map<ChipId, ChipConnection[]>
  mainChipId: ChipId
  mainPinIds: [PinId, PinId]
  pathChipIds: ChipId[]
}): SeriesBranchComponent[] | null => {
  const ordered: SeriesBranchComponent[] = []

  for (let index = 0; index < pathChipIds.length; index++) {
    const chipId = pathChipIds[index]!
    const chip = inputProblem.chipMap[chipId]
    const connections = connectionsByChip.get(chipId) ?? []
    if (
      !chip ||
      connections.length !== TWO_PIN_COMPONENT_PIN_COUNT ||
      new Set(connections.map((connection) => connection.selfPinId)).size !==
        TWO_PIN_COMPONENT_PIN_COUNT
    ) {
      return null
    }

    const previousChipId = index === 0 ? mainChipId : pathChipIds[index - 1]!
    const nextChipId =
      index === pathChipIds.length - 1 ? mainChipId : pathChipIds[index + 1]!
    const previousConnection = connections.find(
      (connection) => connection.otherChipId === previousChipId,
    )
    const nextConnection = connections.find(
      (connection) => connection.otherChipId === nextChipId,
    )
    if (
      !previousConnection ||
      !nextConnection ||
      previousConnection.selfPinId === nextConnection.selfPinId
    ) {
      return null
    }
    if (index === 0 && previousConnection.otherPinId !== mainPinIds[0]) {
      return null
    }
    if (
      index === pathChipIds.length - 1 &&
      nextConnection.otherPinId !== mainPinIds[1]
    ) {
      return null
    }

    ordered.push({
      chipId,
      nearPinId: previousConnection.selfPinId,
      farPinId: nextConnection.selfPinId,
    })
  }

  return ordered
}

/**
 * Finds topology shaped like a U:
 *
 * main pin A -> two-pin components -> shared outer connection
 * main pin B -> two-pin components -> shared outer connection
 *
 * In the strong-connectivity graph this is an even-length series path between
 * two pins on the same side of a multi-pin chip. Splitting the path in half
 * yields the two parallel branches without relying on component names or types.
 */
export const findParallelSeriesBranchGroups = (
  inputProblem: InputProblem,
): ParallelSeriesBranchGroup[] => {
  const connectionsByChip = buildConnectionsByChip(inputProblem)
  const groups: ParallelSeriesBranchGroup[] = []
  const usedPathChipIds = new Set<ChipId>()

  for (const mainChip of Object.values(inputProblem.chipMap)) {
    // The anchor must not itself be one of the two-pin series elements.
    if (mainChip.pins.length <= TWO_PIN_COMPONENT_PIN_COUNT) continue

    const mainConnections = connectionsByChip.get(mainChip.chipId) ?? []
    for (
      let firstIndex = 0;
      firstIndex < mainConnections.length;
      firstIndex++
    ) {
      const firstConnection = mainConnections[firstIndex]!
      const firstPin = inputProblem.chipPinMap[firstConnection.selfPinId]
      if (!firstPin) continue

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < mainConnections.length;
        secondIndex++
      ) {
        const secondConnection = mainConnections[secondIndex]!
        const secondPin = inputProblem.chipPinMap[secondConnection.selfPinId]
        if (
          !secondPin ||
          firstPin.side !== secondPin.side ||
          firstConnection.selfPinId === secondConnection.selfPinId
        ) {
          continue
        }

        const pathChipIds = findTwoPinComponentPath({
          inputProblem,
          connectionsByChip,
          mainChipId: mainChip.chipId,
          startChipId: firstConnection.otherChipId,
          endChipId: secondConnection.otherChipId,
        })
        if (
          !pathChipIds ||
          pathChipIds.length < TWO_PIN_COMPONENT_PIN_COUNT ||
          pathChipIds.length % 2 !== 0 ||
          pathChipIds.some((chipId) => usedPathChipIds.has(chipId))
        ) {
          continue
        }

        const mainPinIds: [PinId, PinId] = [
          firstConnection.selfPinId,
          secondConnection.selfPinId,
        ]
        const orderedComponents = getOrderedSeriesComponents({
          inputProblem,
          connectionsByChip,
          mainChipId: mainChip.chipId,
          mainPinIds,
          pathChipIds,
        })
        if (!orderedComponents) continue

        const splitIndex = orderedComponents.length / 2
        const firstBranch = orderedComponents.slice(0, splitIndex)
        const secondBranch = orderedComponents
          .slice(splitIndex)
          .reverse()
          .map((component) => ({
            chipId: component.chipId,
            nearPinId: component.farPinId,
            farPinId: component.nearPinId,
          }))

        groups.push({
          mainChipId: mainChip.chipId,
          mainPinIds,
          branches: [firstBranch, secondBranch],
        })
        for (const chipId of pathChipIds) usedPathChipIds.add(chipId)
      }
    }
  }

  return groups
}
