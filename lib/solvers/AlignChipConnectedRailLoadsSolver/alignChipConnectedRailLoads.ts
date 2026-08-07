import type {
  Chip,
  ChipId,
  InputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { offsetChipConnectedRailLoadConnections } from "../../utils/offsetCollinearConnections"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import type { ChipConnectedRailLoadPair } from "./getChipConnectedRailLoadPairs"

const DEFAULT_CCW_ROTATIONS_DEGREES: NonNullable<Chip["availableRotations"]> = [
  0, 90, 180, 270,
]
const DEFAULT_CCW_ROTATION_DEGREES = 0
const HALF = 0.5

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
  const railLoadPairsByMainChipId = new Map<
    ChipId,
    ChipConnectedRailLoadPair[]
  >()
  for (const railLoadPair of railLoadPairs) {
    const mainChipRailLoadPairs =
      railLoadPairsByMainChipId.get(railLoadPair.mainChipId) ?? []
    mainChipRailLoadPairs.push(railLoadPair)
    railLoadPairsByMainChipId.set(
      railLoadPair.mainChipId,
      mainChipRailLoadPairs,
    )
  }

  for (const mainChipRailLoadPairs of railLoadPairsByMainChipId.values()) {
    let rowRightEdge: number | undefined

    for (const railLoadPair of mainChipRailLoadPairs) {
      const railComponentPlacement =
        chipPlacements[railLoadPair.railComponent.chipId]
      const resistorPlacement = chipPlacements[railLoadPair.resistor.chipId]
      const mainChipPlacement = chipPlacements[railLoadPair.mainChipId]
      const mainPin = inputProblem.chipPinMap[railLoadPair.mainPinId]
      if (!railComponentPlacement || !resistorPlacement) continue
      if (!mainChipPlacement || !mainPin) continue
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
      /**
       * Keep the rail component above the resistor with the configured body gap.
       */
      const railComponentRowY = resistorRowY + centerDistance

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
      const pairHalfWidth = Math.max(railComponentSize.x, resistorSize.x) * HALF
      const pairMinX = pairX - pairHalfWidth
      const pairMaxX = pairX + pairHalfWidth
      if (rowRightEdge !== undefined) {
        const horizontalShift =
          rowRightEdge + inputProblem.partitionGap - pairMinX
        pairX += horizontalShift
        chipPlacements[railLoadPair.railComponent.chipId]!.x = pairX
        chipPlacements[railLoadPair.resistor.chipId]!.x = pairX
        rowRightEdge = pairMaxX + horizontalShift
        continue
      }
      rowRightEdge = pairMaxX
    }
  }

  offsetChipConnectedRailLoadConnections({
    railLoadPairs,
    inputProblem,
    chipPlacements,
  })

  return outputLayout
}
