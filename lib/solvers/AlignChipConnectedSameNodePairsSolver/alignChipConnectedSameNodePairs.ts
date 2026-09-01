import {
  type Bounds,
  getBoundsFromPoints,
  type Point,
} from "@tscircuit/math-utils"
import type { ChipId, ChipPin, InputProblem } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { Side } from "../../types/Side"
import {
  TRACE_CLEARANCE,
  tryOffsetChips,
} from "../../utils/offsetCollinearConnections"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"
import type { ChipConnectedSameNodePair } from "./getChipConnectedSameNodePairs"

type HorizontalDirection = -1 | 1

type LayoutContext = {
  inputProblem: InputProblem
  layout: OutputLayout
}

const getSideDirection = (side: Side): Point => {
  switch (side) {
    case "x-":
      return { x: -1, y: 0 }
    case "x+":
      return { x: 1, y: 0 }
    case "y-":
      return { x: 0, y: -1 }
    case "y+":
      return { x: 0, y: 1 }
  }
}

const getAbsolutePinPosition = ({
  pin,
  placement,
}: {
  pin: ChipPin
  placement: Placement
}): Point => {
  const rotatedOffset = rotatePinOffset(
    pin.offset,
    placement.ccwRotationDegrees,
  )
  return {
    x: placement.x + rotatedOffset.x,
    y: placement.y + rotatedOffset.y,
  }
}

const getChipBounds = (
  { chipId }: { chipId: ChipId },
  { inputProblem, layout }: LayoutContext,
): Bounds | null => {
  const chip = inputProblem.chipMap[chipId]
  const placement = layout.chipPlacements[chipId]
  if (!chip || !placement) return null
  return getPlacementBounds({ placement, size: chip.size })
}

const getPairBounds = (
  { pair }: { pair: ChipConnectedSameNodePair },
  context: LayoutContext,
): Bounds | null => {
  const componentBounds = pair.components.map(({ chip }) =>
    getChipBounds({ chipId: chip.chipId }, context),
  )
  if (componentBounds.some((bounds) => !bounds)) return null
  return getBoundsFromPoints(
    componentBounds.flatMap((bounds) => [
      { x: bounds!.minX, y: bounds!.minY },
      { x: bounds!.maxX, y: bounds!.maxY },
    ]),
  )
}

const getMainPinHorizontalDirection = (
  { pair }: { pair: ChipConnectedSameNodePair },
  { inputProblem, layout }: LayoutContext,
): HorizontalDirection | null => {
  const mainPin = inputProblem.chipPinMap[pair.mainPinId]
  const mainChipPlacement = layout.chipPlacements[pair.mainChipId]
  if (!mainPin || !mainChipPlacement) return null
  const mainPinDirection = rotatePinOffset(
    getSideDirection(mainPin.side),
    mainChipPlacement.ccwRotationDegrees,
  )
  if (Math.abs(mainPinDirection.y) > Math.abs(mainPinDirection.x)) return null
  if (mainPinDirection.x < 0) return -1
  return 1
}

const getTargetOffsetX = (
  {
    direction,
    mainChipBounds,
    pairBounds,
  }: {
    direction: HorizontalDirection
    mainChipBounds: Bounds
    pairBounds: Bounds
  },
  { inputProblem }: LayoutContext,
): number => {
  if (direction < 0) {
    return mainChipBounds.minX - inputProblem.chipGap - pairBounds.maxX
  }
  return mainChipBounds.maxX + inputProblem.chipGap - pairBounds.minX
}

const getTargetOffsetY = (
  { pair }: { pair: ChipConnectedSameNodePair },
  { inputProblem, layout }: LayoutContext,
): number | null => {
  const mainPin = inputProblem.chipPinMap[pair.mainPinId]
  const mainChipPlacement = layout.chipPlacements[pair.mainChipId]
  if (!mainPin || !mainChipPlacement) return null
  const mainPinPosition = getAbsolutePinPosition({
    pin: mainPin,
    placement: mainChipPlacement,
  })

  let upperConnectedPinY = Number.NEGATIVE_INFINITY
  for (const component of pair.components) {
    const pin = inputProblem.chipPinMap[component.connectedPinId]
    const placement = layout.chipPlacements[component.chip.chipId]
    if (!pin || !placement) return null
    const pinPosition = getAbsolutePinPosition({ pin, placement })
    upperConnectedPinY = Math.max(upperConnectedPinY, pinPosition.y)
  }

  return mainPinPosition.y + TRACE_CLEARANCE - upperConnectedPinY
}

const placePairBesideMainPin = (
  { pair }: { pair: ChipConnectedSameNodePair },
  context: LayoutContext,
): void => {
  const direction = getMainPinHorizontalDirection({ pair }, context)
  if (!direction) return
  const mainChipBounds = getChipBounds({ chipId: pair.mainChipId }, context)
  const pairBounds = getPairBounds({ pair }, context)
  const targetOffsetY = getTargetOffsetY({ pair }, context)
  if (!mainChipBounds || !pairBounds || targetOffsetY === null) return

  const pairChipIds = pair.components.map(({ chip }) => chip.chipId)
  const targetOffsetX = getTargetOffsetX(
    { direction, mainChipBounds, pairBounds },
    context,
  )
  const clearanceStepCount = Object.keys(context.layout.chipPlacements).length

  for (
    let clearanceStep = 0;
    clearanceStep < clearanceStepCount;
    clearanceStep++
  ) {
    const offsetX =
      targetOffsetX +
      direction * context.inputProblem.partitionGap * clearanceStep
    const wasPlaced = tryOffsetChips({
      chipIds: pairChipIds,
      clearanceGroupChipIds: pairChipIds,
      dx: offsetX,
      dy: targetOffsetY,
      chipPlacements: context.layout.chipPlacements,
      inputProblem: context.inputProblem,
    })
    if (wasPlaced) return
  }
}

export const alignChipConnectedSameNodePairs = ({
  pairs,
  inputProblem,
  inputLayout,
}: {
  pairs: ChipConnectedSameNodePair[]
  inputProblem: InputProblem
  inputLayout: OutputLayout
}): OutputLayout => {
  const layout = structuredClone(inputLayout)
  const context = { inputProblem, layout }

  for (const pair of pairs) {
    placePairBesideMainPin({ pair }, context)
  }

  return layout
}
