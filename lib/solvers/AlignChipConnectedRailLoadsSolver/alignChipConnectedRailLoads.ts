import type { Chip, InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { getPlacementBounds } from "../../utils/getPlacementBounds"
import {
  offsetChipConnectedRailLoadConnections,
  tryOffsetChips,
} from "../../utils/offsetCollinearConnections"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import type { ChipConnectedRailLoadPair } from "./getChipConnectedRailLoadPairs"

const DEFAULT_CCW_ROTATIONS_DEGREES: NonNullable<Chip["availableRotations"]> = [
  0, 90, 180, 270,
]
const DEFAULT_CCW_ROTATION_DEGREES = 0
const HALF = 0.5
const SIDE_DIRECTIONS: Record<string, { x: number; y: number }> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

const getVerticalRotation = ({
  chip,
  upperPinId,
  lowerPinId,
  inputProblem,
}: {
  chip: Chip
  upperPinId: PinId
  lowerPinId: PinId
  inputProblem: InputProblem
}): number => {
  const upperPin = inputProblem.chipPinMap[upperPinId]
  const lowerPin = inputProblem.chipPinMap[lowerPinId]
  if (!upperPin || !lowerPin) return DEFAULT_CCW_ROTATION_DEGREES
  const ccwRotationsDegrees =
    chip.availableRotations ?? DEFAULT_CCW_ROTATIONS_DEGREES
  let bestCcwRotationDegrees = DEFAULT_CCW_ROTATION_DEGREES
  let bestPinDeltaY = Number.NEGATIVE_INFINITY
  for (const ccwRotationDegrees of ccwRotationsDegrees) {
    const upperPinOffset = rotatePinOffset(upperPin.offset, ccwRotationDegrees)
    const lowerPinOffset = rotatePinOffset(lowerPin.offset, ccwRotationDegrees)
    const pinDeltaY = upperPinOffset.y - lowerPinOffset.y
    if (pinDeltaY <= bestPinDeltaY) continue
    bestPinDeltaY = pinDeltaY
    bestCcwRotationDegrees = ccwRotationDegrees
  }
  return bestCcwRotationDegrees
}

export const alignChipConnectedRailLoads = ({
  railLoadPairs,
  inputProblem,
  inputLayout,
}: {
  railLoadPairs: ChipConnectedRailLoadPair[]
  inputProblem: InputProblem
  inputLayout: OutputLayout
}): OutputLayout => {
  const outputLayout = structuredClone(inputLayout)
  const { chipPlacements } = outputLayout
  const railLoadPairsByChipSide = new Map<string, ChipConnectedRailLoadPair[]>()

  for (const railLoadPair of railLoadPairs) {
    const mainPin = inputProblem.chipPinMap[railLoadPair.mainPinId]
    const mainChipPlacement = chipPlacements[railLoadPair.mainChipId]
    if (!mainPin || !mainChipPlacement) continue
    if (!chipPlacements[railLoadPair.railComponent.chipId]) continue
    if (!chipPlacements[railLoadPair.resistor.chipId]) continue
    if (!inputProblem.chipPinMap[railLoadPair.resistorMainPinId]) continue

    const pinDirection = rotatePinOffset(
      SIDE_DIRECTIONS[mainPin.side] ?? { x: 1, y: 0 },
      mainChipPlacement.ccwRotationDegrees,
    )
    const sideKey = pinDirection.x < 0 ? "x-" : "x+"
    const key = `${railLoadPair.mainChipId}:${sideKey}`
    const sidePairs = railLoadPairsByChipSide.get(key) ?? []
    sidePairs.push(railLoadPair)
    railLoadPairsByChipSide.set(key, sidePairs)
  }

  for (const sidePairs of railLoadPairsByChipSide.values()) {
    const mainChipPlacement = chipPlacements[sidePairs[0]!.mainChipId]!

    // Higher pins stay nearest the IC so lower branches pass beneath them.
    sidePairs.sort((first, second) => {
      const firstOffset = rotatePinOffset(
        inputProblem.chipPinMap[first.mainPinId]!.offset,
        mainChipPlacement.ccwRotationDegrees,
      )
      const secondOffset = rotatePinOffset(
        inputProblem.chipPinMap[second.mainPinId]!.offset,
        mainChipPlacement.ccwRotationDegrees,
      )
      return secondOffset.y - firstOffset.y
    })

    let rowOutsideEdge: number | undefined

    for (const [pairIndex, railLoadPair] of sidePairs.entries()) {
      const railComponentPlacement =
        chipPlacements[railLoadPair.railComponent.chipId]
      const resistorPlacement = chipPlacements[railLoadPair.resistor.chipId]
      const mainPin = inputProblem.chipPinMap[railLoadPair.mainPinId]
      if (!railComponentPlacement || !resistorPlacement || !mainPin) continue

      const railComponentCcwRotationDegrees = getVerticalRotation({
        chip: railLoadPair.railComponent,
        upperPinId: railLoadPair.railPinId,
        lowerPinId: railLoadPair.railComponentResistorPinId,
        inputProblem,
      })
      const resistorCcwRotationDegrees = getVerticalRotation({
        chip: railLoadPair.resistor,
        upperPinId: railLoadPair.resistorRailComponentPinId,
        lowerPinId: railLoadPair.resistorMainPinId,
        inputProblem,
      })
      const railComponentSize = getRotatedSize(
        railLoadPair.railComponent.size,
        railComponentCcwRotationDegrees,
      )
      const resistorSize = getRotatedSize(
        railLoadPair.resistor.size,
        resistorCcwRotationDegrees,
      )
      const centerDistance =
        railComponentSize.y * HALF +
        inputProblem.chipGap +
        resistorSize.y * HALF
      const mainPinOffset = rotatePinOffset(
        mainPin.offset,
        mainChipPlacement.ccwRotationDegrees,
      )
      const resistorMainPin =
        inputProblem.chipPinMap[railLoadPair.resistorMainPinId]
      if (!resistorMainPin) continue

      const resistorMainPinOffset = rotatePinOffset(
        resistorMainPin.offset,
        resistorCcwRotationDegrees,
      )
      let pairX = (railComponentPlacement.x + resistorPlacement.x) * HALF
      const resistorRowY =
        mainChipPlacement.y + mainPinOffset.y - resistorMainPinOffset.y
      const railComponentRowY = resistorRowY + centerDistance

      const pairHalfWidth = Math.max(railComponentSize.x, resistorSize.x) * HALF
      const pinDirection = rotatePinOffset(
        SIDE_DIRECTIONS[mainPin.side] ?? { x: 1, y: 0 },
        mainChipPlacement.ccwRotationDegrees,
      )
      const xDirection = pinDirection.x < 0 ? -1 : 1
      const mainBounds = getPlacementBounds({
        placement: mainChipPlacement,
        size: inputProblem.chipMap[railLoadPair.mainChipId]!.size,
      })

      if (xDirection < 0) {
        pairX = Math.min(
          pairX,
          mainBounds.minX - inputProblem.chipGap - pairHalfWidth,
        )
      } else {
        pairX = Math.max(
          pairX,
          mainBounds.maxX + inputProblem.chipGap + pairHalfWidth,
        )
      }

      if (rowOutsideEdge !== undefined) {
        pairX =
          rowOutsideEdge +
          xDirection * (inputProblem.partitionGap + pairHalfWidth)
      }

      chipPlacements[railLoadPair.railComponent.chipId] = {
        x: pairX,
        y: railComponentRowY,
        ccwRotationDegrees: railComponentCcwRotationDegrees,
      }
      chipPlacements[railLoadPair.resistor.chipId] = {
        x: pairX,
        y: resistorRowY,
        ccwRotationDegrees: resistorCcwRotationDegrees,
      }

      // Remaining branches in this group will move outward next.
      const clearanceGroupChipIds = sidePairs
        .slice(pairIndex)
        .flatMap((pair) => [pair.railComponent.chipId, pair.resistor.chipId])

      const pairMinY = Math.min(
        resistorRowY - resistorSize.y * HALF,
        railComponentRowY - railComponentSize.y * HALF,
      )
      const pairMaxY = Math.max(
        resistorRowY + resistorSize.y * HALF,
        railComponentRowY + railComponentSize.y * HALF,
      )

      // Only evaluate candidate positions for components that vertically overlap this corridor.
      const candidateXs = [pairX]
      for (const [chipId, placement] of Object.entries(chipPlacements)) {
        if (clearanceGroupChipIds.includes(chipId)) continue
        const chip = inputProblem.chipMap[chipId]
        if (!chip) continue

        const bounds = getPlacementBounds({ placement, size: chip.size })
        const verticalClearance =
          bounds.minY >= pairMaxY + inputProblem.chipGap ||
          bounds.maxY <= pairMinY - inputProblem.chipGap
        if (verticalClearance) continue

        const candidateX =
          xDirection < 0
            ? bounds.minX - inputProblem.chipGap - pairHalfWidth
            : bounds.maxX + inputProblem.chipGap + pairHalfWidth

        if ((candidateX - pairX) * xDirection < 0) continue
        candidateXs.push(candidateX)
      }

      candidateXs.sort((a, b) => (a - b) * xDirection)
      const placedX =
        candidateXs.find((candidateX) =>
          tryOffsetChips({
            chipIds: [
              railLoadPair.railComponent.chipId,
              railLoadPair.resistor.chipId,
            ],
            clearanceGroupChipIds,
            dx: candidateX - pairX,
            dy: 0,
            chipPlacements,
            inputProblem,
          }),
        ) ?? pairX

      rowOutsideEdge = placedX + xDirection * pairHalfWidth
    }
  }

  offsetChipConnectedRailLoadConnections({
    railLoadPairs,
    inputProblem,
    chipPlacements,
  })

  return outputLayout
}
