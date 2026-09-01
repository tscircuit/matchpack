import {
  getBoundsFromPoints,
  type Bounds,
  type Point,
} from "@tscircuit/math-utils"
import type { ChipId, InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import type { Side } from "../../types/Side"
import { tryOffsetChips } from "../../utils/offsetCollinearConnections"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"
import type { ChipConnectedPowerFilter } from "./getChipConnectedPowerFilters"

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

const getChipBounds = (
  { chipId }: { chipId: ChipId },
  { inputProblem, layout }: LayoutContext,
): Bounds | null => {
  const chip = inputProblem.chipMap[chipId]
  const placement = layout.chipPlacements[chipId]
  if (!chip || !placement) return null
  return getPlacementBounds({ placement, size: chip.size })
}

const getPowerFilterBounds = (
  { powerFilter }: { powerFilter: ChipConnectedPowerFilter },
  context: LayoutContext,
): Bounds | null => {
  const railComponentBounds = getChipBounds(
    { chipId: powerFilter.railComponentChipId },
    context,
  )
  const capacitorBounds = getChipBounds(
    { chipId: powerFilter.capacitorChipId },
    context,
  )
  if (!railComponentBounds || !capacitorBounds) return null
  return getBoundsFromPoints(
    [railComponentBounds, capacitorBounds].flatMap((chipBounds) => [
      { x: chipBounds.minX, y: chipBounds.minY },
      { x: chipBounds.maxX, y: chipBounds.maxY },
    ]),
  )
}

const getMainPinHorizontalDirection = (
  { powerFilter }: { powerFilter: ChipConnectedPowerFilter },
  { inputProblem, layout }: LayoutContext,
): HorizontalDirection | null => {
  const mainPin = inputProblem.chipPinMap[powerFilter.mainPinId]
  const mainChipPlacement = layout.chipPlacements[powerFilter.mainChipId]
  if (!mainPin || !mainChipPlacement) return null
  const mainPinDirection = rotatePinOffset(
    getSideDirection(mainPin.side),
    mainChipPlacement.ccwRotationDegrees,
  )
  if (Math.abs(mainPinDirection.y) > Math.abs(mainPinDirection.x)) return null
  if (mainPinDirection.x < 0) return -1
  return 1
}

const getPowerFilterTargetOffsetX = (
  {
    direction,
    mainChipBounds,
    powerFilterBounds,
  }: {
    direction: HorizontalDirection
    mainChipBounds: Bounds
    powerFilterBounds: Bounds
  },
  { inputProblem }: LayoutContext,
): number => {
  if (direction < 0) {
    return mainChipBounds.minX - inputProblem.chipGap - powerFilterBounds.maxX
  }
  return mainChipBounds.maxX + inputProblem.chipGap - powerFilterBounds.minX
}

const placePowerFilterOutsideMainChip = (
  { powerFilter }: { powerFilter: ChipConnectedPowerFilter },
  context: LayoutContext,
): void => {
  const direction = getMainPinHorizontalDirection({ powerFilter }, context)
  if (!direction) return
  const mainChipBounds = getChipBounds(
    { chipId: powerFilter.mainChipId },
    context,
  )
  const powerFilterBounds = getPowerFilterBounds({ powerFilter }, context)
  if (!mainChipBounds || !powerFilterBounds) return

  const powerFilterChipIds = [
    powerFilter.railComponentChipId,
    powerFilter.capacitorChipId,
  ]
  const targetOffsetX = getPowerFilterTargetOffsetX(
    { direction, mainChipBounds, powerFilterBounds },
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
      chipIds: powerFilterChipIds,
      clearanceGroupChipIds: powerFilterChipIds,
      dx: offsetX,
      dy: 0,
      chipPlacements: context.layout.chipPlacements,
      inputProblem: context.inputProblem,
    })
    if (wasPlaced) return
  }
}

export const alignChipConnectedPowerFilters = ({
  powerFilters,
  inputProblem,
  inputLayout,
}: {
  powerFilters: ChipConnectedPowerFilter[]
  inputProblem: InputProblem
  inputLayout: OutputLayout
}): OutputLayout => {
  const layout = structuredClone(inputLayout)
  const context = { inputProblem, layout }

  for (const powerFilter of powerFilters) {
    placePowerFilterOutsideMainChip({ powerFilter }, context)
  }

  return layout
}
