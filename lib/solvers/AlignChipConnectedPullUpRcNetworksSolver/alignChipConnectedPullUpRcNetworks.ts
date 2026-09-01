import {
  type Bounds,
  getBoundsFromPoints,
  type Point,
} from "@tscircuit/math-utils"
import type { ChipId, ChipPin, InputProblem } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { Side } from "../../types/Side"
import { tryOffsetChips } from "../../utils/offsetCollinearConnections"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"
import type { ChipConnectedPullUpRcNetwork } from "./getChipConnectedPullUpRcNetworks"

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

const getRcNetworkBounds = (
  { pullUpRcNetwork }: { pullUpRcNetwork: ChipConnectedPullUpRcNetwork },
  context: LayoutContext,
): Bounds | null => {
  const resistorBounds = getChipBounds(
    { chipId: pullUpRcNetwork.resistorChipId },
    context,
  )
  const capacitorBounds = getChipBounds(
    { chipId: pullUpRcNetwork.capacitorChipId },
    context,
  )
  if (!resistorBounds || !capacitorBounds) return null
  return getBoundsFromPoints(
    [resistorBounds, capacitorBounds].flatMap((chipBounds) => [
      { x: chipBounds.minX, y: chipBounds.minY },
      { x: chipBounds.maxX, y: chipBounds.maxY },
    ]),
  )
}

const getMainPinHorizontalDirection = (
  { pullUpRcNetwork }: { pullUpRcNetwork: ChipConnectedPullUpRcNetwork },
  { inputProblem, layout }: LayoutContext,
): HorizontalDirection | null => {
  const mainPin = inputProblem.chipPinMap[pullUpRcNetwork.mainPinId]
  const mainChipPlacement = layout.chipPlacements[pullUpRcNetwork.mainChipId]
  if (!mainPin || !mainChipPlacement) return null
  const mainPinDirection = rotatePinOffset(
    getSideDirection(mainPin.side),
    mainChipPlacement.ccwRotationDegrees,
  )
  if (Math.abs(mainPinDirection.y) > Math.abs(mainPinDirection.x)) return null
  if (mainPinDirection.x < 0) return -1
  return 1
}

const getRcNetworkTargetOffsetX = (
  {
    direction,
    mainChipBounds,
    rcNetworkBounds,
  }: {
    direction: HorizontalDirection
    mainChipBounds: Bounds
    rcNetworkBounds: Bounds
  },
  { inputProblem }: LayoutContext,
): number => {
  if (direction < 0) {
    return mainChipBounds.minX - inputProblem.chipGap - rcNetworkBounds.maxX
  }
  return mainChipBounds.maxX + inputProblem.chipGap - rcNetworkBounds.minX
}

const getResistorMainPinTargetOffsetY = (
  { pullUpRcNetwork }: { pullUpRcNetwork: ChipConnectedPullUpRcNetwork },
  { inputProblem, layout }: LayoutContext,
): number | null => {
  const mainPin = inputProblem.chipPinMap[pullUpRcNetwork.mainPinId]
  const resistorMainPin =
    inputProblem.chipPinMap[pullUpRcNetwork.resistorMainPinId]
  const mainChipPlacement = layout.chipPlacements[pullUpRcNetwork.mainChipId]
  const resistorPlacement =
    layout.chipPlacements[pullUpRcNetwork.resistorChipId]
  if (!mainPin || !resistorMainPin) return null
  if (!mainChipPlacement || !resistorPlacement) return null

  const mainPinPosition = getAbsolutePinPosition({
    pin: mainPin,
    placement: mainChipPlacement,
  })
  const resistorMainPinPosition = getAbsolutePinPosition({
    pin: resistorMainPin,
    placement: resistorPlacement,
  })
  return mainPinPosition.y - resistorMainPinPosition.y
}

const placePullUpRcNetworkBesideMainPin = (
  { pullUpRcNetwork }: { pullUpRcNetwork: ChipConnectedPullUpRcNetwork },
  context: LayoutContext,
): void => {
  const direction = getMainPinHorizontalDirection({ pullUpRcNetwork }, context)
  if (!direction) return
  const mainChipBounds = getChipBounds(
    { chipId: pullUpRcNetwork.mainChipId },
    context,
  )
  const rcNetworkBounds = getRcNetworkBounds({ pullUpRcNetwork }, context)
  const targetOffsetY = getResistorMainPinTargetOffsetY(
    { pullUpRcNetwork },
    context,
  )
  if (!mainChipBounds || !rcNetworkBounds || targetOffsetY === null) return

  const rcNetworkChipIds = [
    pullUpRcNetwork.resistorChipId,
    pullUpRcNetwork.capacitorChipId,
  ]
  const targetOffsetX = getRcNetworkTargetOffsetX(
    { direction, mainChipBounds, rcNetworkBounds },
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
      chipIds: rcNetworkChipIds,
      clearanceGroupChipIds: rcNetworkChipIds,
      dx: offsetX,
      dy: targetOffsetY,
      chipPlacements: context.layout.chipPlacements,
      inputProblem: context.inputProblem,
    })
    if (wasPlaced) return
  }
}

export const alignChipConnectedPullUpRcNetworks = ({
  pullUpRcNetworks,
  inputProblem,
  inputLayout,
}: {
  pullUpRcNetworks: ChipConnectedPullUpRcNetwork[]
  inputProblem: InputProblem
  inputLayout: OutputLayout
}): OutputLayout => {
  const layout = structuredClone(inputLayout)
  const context = { inputProblem, layout }

  for (const pullUpRcNetwork of pullUpRcNetworks) {
    placePullUpRcNetworkBesideMainPin({ pullUpRcNetwork }, context)
  }

  return layout
}
