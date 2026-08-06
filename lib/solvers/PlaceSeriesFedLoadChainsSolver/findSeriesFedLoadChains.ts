import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  PinId,
} from "../../types/InputProblem"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

const MINIMUM_LOAD_CHAIN_LENGTH = 2
const MINIMUM_LOAD_PIN_COUNT = 3
const SERIES_COMPONENT_PIN_COUNT = 2
const DEFAULT_ROTATIONS = [0, 90, 180, 270] as const

export type SeriesFedLoadChain = {
  sourceChipId: ChipId
  sourcePinId: PinId
  seriesChipId: ChipId
  seriesSourcePinId: PinId
  seriesLoadPinId: PinId
  loadChipIds: ChipId[]
  loadEntryPinId: PinId
  sourceRailChipIds: ChipId[]
}

type ConnectivityContext = {
  inputProblem: InputProblem
  pinOwnerMap: Map<PinId, Chip>
  connectedPinsByPinId: Record<PinId, ChipPin[]>
}

const haveMatchingLoadGeometry = ({
  firstChip,
  secondChip,
  inputProblem,
}: {
  firstChip: Chip
  secondChip: Chip
  inputProblem: InputProblem
}): boolean => {
  if (firstChip.pins.length !== secondChip.pins.length) return false
  if (firstChip.size.x !== secondChip.size.x) return false
  if (firstChip.size.y !== secondChip.size.y) return false

  const firstRotations = firstChip.availableRotations ?? DEFAULT_ROTATIONS
  const secondRotations = secondChip.availableRotations ?? DEFAULT_ROTATIONS
  if (firstRotations.length !== secondRotations.length) return false
  if (
    firstRotations.some(
      (ccwRotationDegrees, index) =>
        ccwRotationDegrees !== secondRotations[index],
    )
  ) {
    return false
  }

  for (const [index, firstPinId] of firstChip.pins.entries()) {
    const firstPin = inputProblem.chipPinMap[firstPinId]
    const secondPin = inputProblem.chipPinMap[secondChip.pins[index]!]
    if (!firstPin || !secondPin) return false
    if (firstPin.side !== secondPin.side) return false
    if (firstPin.offset.x !== secondPin.offset.x) return false
    if (firstPin.offset.y !== secondPin.offset.y) return false
  }
  return true
}

const getConnectedChipPins = (
  { pinId }: { pinId: PinId },
  context: ConnectivityContext,
): Array<{ chip: Chip; pin: ChipPin }> => {
  const connectedChipPins: Array<{ chip: Chip; pin: ChipPin }> = []
  for (const pin of context.connectedPinsByPinId[pinId] ?? []) {
    const chip = context.pinOwnerMap.get(pin.pinId)
    if (chip) connectedChipPins.push({ chip, pin })
  }
  return connectedChipPins
}

const getMatchingLoadNeighbors = (
  { chip }: { chip: Chip },
  context: ConnectivityContext,
): Chip[] => {
  const neighboringChips = new Map<ChipId, Chip>()
  for (const pinId of chip.pins) {
    for (const connected of getConnectedChipPins({ pinId }, context)) {
      if (connected.chip.chipId === chip.chipId) continue
      if (
        !haveMatchingLoadGeometry({
          firstChip: chip,
          secondChip: connected.chip,
          inputProblem: context.inputProblem,
        })
      ) {
        continue
      }
      neighboringChips.set(connected.chip.chipId, connected.chip)
    }
  }
  return [...neighboringChips.values()]
}

const getLoadEntry = (
  { loadChip }: { loadChip: Chip },
  context: ConnectivityContext,
): {
  sourceChip: Chip
  sourcePinId: PinId
  seriesChip: Chip
  seriesSourcePinId: PinId
  seriesLoadPinId: PinId
  loadEntryPinId: PinId
} | null => {
  for (const loadEntryPinId of loadChip.pins) {
    for (const seriesConnection of getConnectedChipPins(
      { pinId: loadEntryPinId },
      context,
    )) {
      const seriesChip = seriesConnection.chip
      if (seriesChip.pins.length !== SERIES_COMPONENT_PIN_COUNT) continue
      if (seriesChip.fixedPosition) continue

      const seriesLoadPinId = seriesConnection.pin.pinId
      const seriesSourcePinId = seriesChip.pins.find(
        (pinId) => pinId !== seriesLoadPinId,
      )
      if (!seriesSourcePinId) continue

      const sourceConnections = getConnectedChipPins(
        { pinId: seriesSourcePinId },
        context,
      ).filter((connection) => connection.chip.chipId !== seriesChip.chipId)
      if (sourceConnections.length !== 1) continue

      const sourceConnection = sourceConnections[0]!
      if (sourceConnection.chip.pins.length < MINIMUM_LOAD_PIN_COUNT) continue
      if (sourceConnection.chip.fixedPosition) continue
      if (
        haveMatchingLoadGeometry({
          firstChip: loadChip,
          secondChip: sourceConnection.chip,
          inputProblem: context.inputProblem,
        })
      ) {
        continue
      }

      return {
        sourceChip: sourceConnection.chip,
        sourcePinId: sourceConnection.pin.pinId,
        seriesChip,
        seriesSourcePinId,
        seriesLoadPinId,
        loadEntryPinId,
      }
    }
  }
  return null
}

const getOrderedLoadChain = (
  { entryChip }: { entryChip: Chip },
  context: ConnectivityContext,
): ChipId[] | null => {
  const orderedChipIds: ChipId[] = []
  const visitedChipIds = new Set<ChipId>()
  let previousChipId: ChipId | null = null
  let currentChip: Chip | null = entryChip

  while (currentChip) {
    orderedChipIds.push(currentChip.chipId)
    visitedChipIds.add(currentChip.chipId)
    const nextChips: Chip[] = getMatchingLoadNeighbors(
      { chip: currentChip },
      context,
    )
      .filter((chip) => chip.chipId !== previousChipId)
      .filter((chip) => !visitedChipIds.has(chip.chipId))
    if (nextChips.length > 1) return null
    previousChipId = currentChip.chipId
    currentChip = nextChips[0] ?? null
  }

  if (orderedChipIds.length < MINIMUM_LOAD_CHAIN_LENGTH) return null
  return orderedChipIds
}

const pinConnectsToRail = (
  { pinId }: { pinId: PinId },
  { inputProblem }: ConnectivityContext,
): boolean => {
  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (!net.isGround && !net.isPositiveVoltageSource) continue
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) return true
  }
  return false
}

const getSourceRailChipIds = (
  { sourceChip, excludedChipId }: { sourceChip: Chip; excludedChipId: ChipId },
  context: ConnectivityContext,
): ChipId[] => {
  const railChipIds = new Set<ChipId>()
  for (const sourcePinId of sourceChip.pins) {
    for (const connection of getConnectedChipPins(
      { pinId: sourcePinId },
      context,
    )) {
      const railChip = connection.chip
      if (railChip.chipId === excludedChipId) continue
      if (railChip.pins.length !== SERIES_COMPONENT_PIN_COUNT) continue
      if (railChip.fixedPosition) continue
      const farPinId = railChip.pins.find(
        (pinId) => pinId !== connection.pin.pinId,
      )
      if (!farPinId) continue
      if (pinConnectsToRail({ pinId: farPinId }, context)) {
        railChipIds.add(railChip.chipId)
      }
    }
  }
  return [...railChipIds]
}

export const findSeriesFedLoadChains = (
  inputProblem: InputProblem,
): SeriesFedLoadChain[] => {
  const context: ConnectivityContext = {
    inputProblem,
    pinOwnerMap: createPinOwnerMap(inputProblem),
    connectedPinsByPinId: getPinIdToStronglyConnectedPinsObj(inputProblem),
  }
  const chains: SeriesFedLoadChain[] = []
  const claimedLoadChipIds = new Set<ChipId>()

  for (const loadChip of Object.values(inputProblem.chipMap)) {
    if (loadChip.pins.length < MINIMUM_LOAD_PIN_COUNT) continue
    if (loadChip.fixedPosition) continue
    if (claimedLoadChipIds.has(loadChip.chipId)) continue

    const loadEntry = getLoadEntry({ loadChip }, context)
    if (!loadEntry) continue
    const loadChipIds = getOrderedLoadChain({ entryChip: loadChip }, context)
    if (!loadChipIds) continue

    chains.push({
      sourceChipId: loadEntry.sourceChip.chipId,
      sourcePinId: loadEntry.sourcePinId,
      seriesChipId: loadEntry.seriesChip.chipId,
      seriesSourcePinId: loadEntry.seriesSourcePinId,
      seriesLoadPinId: loadEntry.seriesLoadPinId,
      loadChipIds,
      loadEntryPinId: loadEntry.loadEntryPinId,
      sourceRailChipIds: getSourceRailChipIds(
        {
          sourceChip: loadEntry.sourceChip,
          excludedChipId: loadEntry.seriesChip.chipId,
        },
        context,
      ),
    })
    for (const chipId of loadChipIds) claimedLoadChipIds.add(chipId)
  }

  return chains
}
