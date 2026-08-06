import {
  type Bounds,
  doBoundsOverlap,
  getBoundFromCenteredRect,
} from "@tscircuit/math-utils"
import type { ChipId, InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import type { SeriesFedLoadChain } from "./findSeriesFedLoadChains"

const QUARTER_TURN_ROTATIONS = [0, 90, 180, 270] as const

type PlacementContext = {
  inputProblem: InputProblem
  layout: OutputLayout
  connectedPinIdsByPinId: Record<PinId, PinId[]>
  pinOwnerByPinId: ReturnType<typeof createPinOwnerMap>
}

const getPlacementBounds = (
  { chipId }: { chipId: ChipId },
  context: PlacementContext,
): Bounds | null => {
  const chip = context.inputProblem.chipMap[chipId]
  const placement = context.layout.chipPlacements[chipId]
  if (!chip || !placement) return null
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })
}

const getConnectedPinId = (
  { chipId, connectedChipId }: { chipId: ChipId; connectedChipId: ChipId },
  context: PlacementContext,
): PinId | null => {
  const chip = context.inputProblem.chipMap[chipId]
  if (!chip) return null
  for (const pinId of chip.pins) {
    const connectsToChip = (context.connectedPinIdsByPinId[pinId] ?? []).some(
      (connectedPinId) =>
        context.pinOwnerByPinId.get(connectedPinId)?.chipId === connectedChipId,
    )
    if (connectsToChip) return pinId
  }
  return null
}

const getHorizontalDirection = ({
  pinOffset,
}: {
  pinOffset: { x: number; y: number }
}): -1 | 1 | null => {
  if (Math.abs(pinOffset.x) <= Math.abs(pinOffset.y)) return null
  if (pinOffset.x < 0) return -1
  return 1
}

const getSeriesRotation = ({
  chainDirection,
  chain,
  inputProblem,
}: {
  chainDirection: -1 | 1
  chain: SeriesFedLoadChain
  inputProblem: InputProblem
}): number | null => {
  const seriesChip = inputProblem.chipMap[chain.seriesChipId]
  const sourcePin = inputProblem.chipPinMap[chain.seriesSourcePinId]
  const loadPin = inputProblem.chipPinMap[chain.seriesLoadPinId]
  if (!seriesChip || !sourcePin || !loadPin) return null

  for (const ccwRotationDegrees of seriesChip.availableRotations ??
    QUARTER_TURN_ROTATIONS) {
    const sourceOffset = rotatePinOffset(sourcePin.offset, ccwRotationDegrees)
    const loadOffset = rotatePinOffset(loadPin.offset, ccwRotationDegrees)
    if (
      getHorizontalDirection({ pinOffset: sourceOffset }) !== -chainDirection
    ) {
      continue
    }
    if (getHorizontalDirection({ pinOffset: loadOffset }) === chainDirection) {
      return ccwRotationDegrees
    }
  }
  return null
}

const orderLoadPlacements = (
  {
    chain,
    chainDirection,
  }: { chain: SeriesFedLoadChain; chainDirection: -1 | 1 },
  { layout }: PlacementContext,
): boolean => {
  const placementSlots = chain.loadChipIds
    .map((chipId) => layout.chipPlacements[chipId])
    .filter((placement): placement is Placement => Boolean(placement))
    .sort((firstPlacement, secondPlacement) => {
      return chainDirection * (firstPlacement.x - secondPlacement.x)
    })
  if (placementSlots.length !== chain.loadChipIds.length) return false

  for (const [index, chipId] of chain.loadChipIds.entries()) {
    const placement = layout.chipPlacements[chipId]!
    const slot = placementSlots[index]!
    layout.chipPlacements[chipId] = {
      ...placement,
      x: slot.x,
      y: slot.y,
    }
  }
  return true
}

const placeSourceAndSeriesChip = (
  {
    chain,
    chainDirection,
  }: { chain: SeriesFedLoadChain; chainDirection: -1 | 1 },
  context: PlacementContext,
): boolean => {
  const sourcePlacement = context.layout.chipPlacements[chain.sourceChipId]
  const loadPlacement = context.layout.chipPlacements[chain.loadChipIds[0]!]
  const sourcePin = context.inputProblem.chipPinMap[chain.sourcePinId]
  const loadPin = context.inputProblem.chipPinMap[chain.loadEntryPinId]
  const seriesSourcePin =
    context.inputProblem.chipPinMap[chain.seriesSourcePinId]
  const seriesLoadPin = context.inputProblem.chipPinMap[chain.seriesLoadPinId]
  if (!sourcePlacement || !loadPlacement) return false
  if (!sourcePin || !loadPin || !seriesSourcePin || !seriesLoadPin) return false

  const loadPinOffset = rotatePinOffset(
    loadPin.offset,
    loadPlacement.ccwRotationDegrees,
  )
  const sourcePinOffset = rotatePinOffset(
    sourcePin.offset,
    sourcePlacement.ccwRotationDegrees,
  )
  if (
    getHorizontalDirection({ pinOffset: loadPinOffset }) !== -chainDirection
  ) {
    return false
  }
  if (
    getHorizontalDirection({ pinOffset: sourcePinOffset }) !== chainDirection
  ) {
    return false
  }

  const seriesRotation = getSeriesRotation({
    chainDirection,
    chain,
    inputProblem: context.inputProblem,
  })
  if (seriesRotation === null) return false
  const seriesSourceOffset = rotatePinOffset(
    seriesSourcePin.offset,
    seriesRotation,
  )
  const seriesLoadOffset = rotatePinOffset(seriesLoadPin.offset, seriesRotation)
  const loadPinPosition = {
    x: loadPlacement.x + loadPinOffset.x,
    y: loadPlacement.y + loadPinOffset.y,
  }
  const seriesLoadPinPosition = {
    x: loadPinPosition.x - chainDirection * context.inputProblem.chipGap,
    y: loadPinPosition.y,
  }
  const seriesPlacement: Placement = {
    x: seriesLoadPinPosition.x - seriesLoadOffset.x,
    y: seriesLoadPinPosition.y - seriesLoadOffset.y,
    ccwRotationDegrees: seriesRotation,
  }
  context.layout.chipPlacements[chain.seriesChipId] = seriesPlacement

  const seriesSourcePinPosition = {
    x: seriesPlacement.x + seriesSourceOffset.x,
    y: seriesPlacement.y + seriesSourceOffset.y,
  }
  context.layout.chipPlacements[chain.sourceChipId] = {
    ...sourcePlacement,
    x:
      seriesSourcePinPosition.x -
      chainDirection * context.inputProblem.chipGap -
      sourcePinOffset.x,
    y: seriesSourcePinPosition.y - sourcePinOffset.y,
  }
  return true
}

const placeSourceRailChips = (
  { chain }: { chain: SeriesFedLoadChain },
  context: PlacementContext,
): boolean => {
  const sourcePlacement = context.layout.chipPlacements[chain.sourceChipId]
  if (!sourcePlacement) return false

  for (const railChipId of chain.sourceRailChipIds) {
    const railChip = context.inputProblem.chipMap[railChipId]
    const sourceConnectedPinId = getConnectedPinId(
      { chipId: chain.sourceChipId, connectedChipId: railChipId },
      context,
    )
    const railConnectedPinId = getConnectedPinId(
      { chipId: railChipId, connectedChipId: chain.sourceChipId },
      context,
    )
    if (!railChip || !sourceConnectedPinId || !railConnectedPinId) return false
    const sourceConnectedPin =
      context.inputProblem.chipPinMap[sourceConnectedPinId]
    const railConnectedPin = context.inputProblem.chipPinMap[railConnectedPinId]
    if (!sourceConnectedPin || !railConnectedPin) return false

    let selectedRotation: number | null = null
    for (const ccwRotationDegrees of railChip.availableRotations ??
      QUARTER_TURN_ROTATIONS) {
      const offset = rotatePinOffset(
        railConnectedPin.offset,
        ccwRotationDegrees,
      )
      if (offset.y < 0) {
        selectedRotation = ccwRotationDegrees
        break
      }
    }
    if (selectedRotation === null) return false

    const sourceOffset = rotatePinOffset(
      sourceConnectedPin.offset,
      sourcePlacement.ccwRotationDegrees,
    )
    const railOffset = rotatePinOffset(
      railConnectedPin.offset,
      selectedRotation,
    )
    const sourcePinPosition = {
      x: sourcePlacement.x + sourceOffset.x,
      y: sourcePlacement.y + sourceOffset.y,
    }
    context.layout.chipPlacements[railChipId] = {
      x: sourcePinPosition.x - railOffset.x,
      y: sourcePinPosition.y + context.inputProblem.chipGap - railOffset.y,
      ccwRotationDegrees: selectedRotation,
    }
  }
  return true
}

const layoutHasOverlaps = (context: PlacementContext): boolean => {
  const chipIds = Object.keys(context.layout.chipPlacements)
  for (let firstIndex = 0; firstIndex < chipIds.length; firstIndex++) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < chipIds.length;
      secondIndex++
    ) {
      const firstBounds = getPlacementBounds(
        { chipId: chipIds[firstIndex]! },
        context,
      )
      const secondBounds = getPlacementBounds(
        { chipId: chipIds[secondIndex]! },
        context,
      )
      if (!firstBounds || !secondBounds) continue
      if (doBoundsOverlap(firstBounds, secondBounds)) return true
    }
  }
  return false
}

export const placeSeriesFedLoadChains = ({
  inputProblem,
  inputLayout,
  chains,
}: {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  chains: SeriesFedLoadChain[]
}): OutputLayout => {
  const layout = structuredClone(inputLayout)
  const connectedPinsByPinId = getPinIdToStronglyConnectedPinsObj(inputProblem)
  const connectedPinIdsByPinId: Record<PinId, PinId[]> = {}
  for (const [pinId, connectedPins] of Object.entries(connectedPinsByPinId)) {
    connectedPinIdsByPinId[pinId] = connectedPins.map((pin) => pin.pinId)
  }
  const context: PlacementContext = {
    inputProblem,
    layout,
    connectedPinIdsByPinId,
    pinOwnerByPinId: createPinOwnerMap(inputProblem),
  }

  for (const chain of chains) {
    const previousPlacements = structuredClone(layout.chipPlacements)
    const loadPlacement = layout.chipPlacements[chain.loadChipIds[0]!]
    const loadPin = inputProblem.chipPinMap[chain.loadEntryPinId]
    if (!loadPlacement || !loadPin) continue
    const loadPinOffset = rotatePinOffset(
      loadPin.offset,
      loadPlacement.ccwRotationDegrees,
    )
    const loadEntryDirection = getHorizontalDirection({
      pinOffset: loadPinOffset,
    })
    if (loadEntryDirection === null) continue
    let chainDirection: -1 | 1 = -1
    if (loadEntryDirection === -1) chainDirection = 1

    if (!orderLoadPlacements({ chain, chainDirection }, context)) continue
    if (!placeSourceAndSeriesChip({ chain, chainDirection }, context)) {
      layout.chipPlacements = previousPlacements
      continue
    }
    if (
      !placeSourceRailChips({ chain }, context) ||
      layoutHasOverlaps(context)
    ) {
      layout.chipPlacements = previousPlacements
    }
  }
  return layout
}
