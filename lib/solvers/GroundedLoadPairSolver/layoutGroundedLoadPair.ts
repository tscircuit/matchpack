import {
  getBoundFromCenteredRect,
  getBoundsCenter,
  getBoundsFromPoints,
} from "@tscircuit/math-utils"
import type { Chip, InputProblem, PinId } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"
import { getVerticalPinClearanceOffset } from "./getVerticalPinClearanceOffset"

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
}) => {
  const upperPin = inputProblem.chipPinMap[upperPinId]
  const lowerPin = inputProblem.chipPinMap[lowerPinId]
  if (!upperPin || !lowerPin) return DEFAULT_CCW_ROTATION_DEGREES

  let ccwRotationsDegrees: NonNullable<Chip["availableRotations"]> =
    DEFAULT_CCW_ROTATIONS_DEGREES
  if (chip.availableRotations) {
    ccwRotationsDegrees = chip.availableRotations
  }
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

const getChipBounds = ({
  chip,
  placement,
}: {
  chip: Chip
  placement: Placement
}) => {
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })
}

const movePairBelowObstacles = ({
  groundedLoadPair,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPair: GroundedLoadPair
  chipPlacements: Record<string, Placement>
  inputProblem: InputProblem
}) => {
  const upperPlacement = chipPlacements[groundedLoadPair.upperChip.chipId]
  const lowerPlacement = chipPlacements[groundedLoadPair.lowerChip.chipId]
  if (!upperPlacement || !lowerPlacement) return

  const upperBounds = getChipBounds({
    chip: groundedLoadPair.upperChip,
    placement: upperPlacement,
  })
  const lowerBounds = getChipBounds({
    chip: groundedLoadPair.lowerChip,
    placement: lowerPlacement,
  })
  const pairBounds = getBoundsFromPoints([
    { x: upperBounds.minX, y: upperBounds.minY },
    { x: upperBounds.maxX, y: upperBounds.maxY },
    { x: lowerBounds.minX, y: lowerBounds.minY },
    { x: lowerBounds.maxX, y: lowerBounds.maxY },
  ])
  if (!pairBounds) return

  let downwardShift = 0
  for (const [chipId, placement] of Object.entries(chipPlacements)) {
    if (chipId === groundedLoadPair.upperChip.chipId) continue
    if (chipId === groundedLoadPair.lowerChip.chipId) continue
    const chip = inputProblem.chipMap[chipId]
    if (!chip) continue

    const bounds = getChipBounds({ chip, placement })
    const clearsPairOnX =
      pairBounds.maxX + inputProblem.chipGap <= bounds.minX ||
      pairBounds.minX - inputProblem.chipGap >= bounds.maxX
    if (clearsPairOnX) continue
    if (bounds.maxY <= pairBounds.maxY) continue

    const requiredShift = pairBounds.maxY + inputProblem.chipGap - bounds.minY
    downwardShift = Math.max(downwardShift, requiredShift)
  }

  upperPlacement.y -= downwardShift
  lowerPlacement.y -= downwardShift
}

export const layoutGroundedLoadPair = ({
  groundedLoadPair,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPair: GroundedLoadPair
  chipPlacements: Record<string, Placement>
  inputProblem: InputProblem
}) => {
  const upperPlacement = chipPlacements[groundedLoadPair.upperChip.chipId]
  const lowerPlacement = chipPlacements[groundedLoadPair.lowerChip.chipId]
  if (!upperPlacement || !lowerPlacement) return

  const upperCcwRotationDegrees = getVerticalRotation({
    chip: groundedLoadPair.upperChip,
    upperPinId: groundedLoadPair.upperOuterPinId,
    lowerPinId: groundedLoadPair.upperInnerPinId,
    inputProblem,
  })
  const lowerCcwRotationDegrees = getVerticalRotation({
    chip: groundedLoadPair.lowerChip,
    upperPinId: groundedLoadPair.lowerInnerPinId,
    lowerPinId: groundedLoadPair.groundPinId,
    inputProblem,
  })
  const upperSize = getRotatedSize(
    groundedLoadPair.upperChip.size,
    upperCcwRotationDegrees,
  )
  const lowerSize = getRotatedSize(
    groundedLoadPair.lowerChip.size,
    lowerCcwRotationDegrees,
  )
  const centerDistance =
    upperSize.y * HALF + inputProblem.chipGap + lowerSize.y * HALF
  const upperInnerPin =
    inputProblem.chipPinMap[groundedLoadPair.upperInnerPinId]
  const lowerInnerPin =
    inputProblem.chipPinMap[groundedLoadPair.lowerInnerPinId]
  if (!upperInnerPin || !lowerInnerPin) return

  const upperInnerPinOffset = rotatePinOffset(
    upperInnerPin.offset,
    upperCcwRotationDegrees,
  )
  const lowerInnerPinOffset = rotatePinOffset(
    lowerInnerPin.offset,
    lowerCcwRotationDegrees,
  )
  const initialPairBounds = getBoundsFromPoints([
    upperPlacement,
    lowerPlacement,
  ])
  if (!initialPairBounds) return
  const pairCenter = getBoundsCenter(initialPairBounds)

  const nextUpperPlacement = {
    x: pairCenter.x - upperInnerPinOffset.x,
    y: pairCenter.y + centerDistance * HALF,
    ccwRotationDegrees: upperCcwRotationDegrees,
  }

  const mainPinId = groundedLoadPair.mainPinId
  if (mainPinId) {
    const mainChip = Object.values(inputProblem.chipMap).find((chip) =>
      chip.pins.includes(mainPinId),
    )
    if (!mainChip) return
    const mainPlacement = chipPlacements[mainChip.chipId]
    if (!mainPlacement) return

    const upperOuterPin =
      inputProblem.chipPinMap[groundedLoadPair.upperOuterPinId]
    const mainPin = inputProblem.chipPinMap[mainPinId]
    if (!upperOuterPin || !mainPin) return

    const oldUpperOuterPinOffset = rotatePinOffset(
      upperOuterPin.offset,
      upperPlacement.ccwRotationDegrees,
    )
    const newUpperOuterPinOffset = rotatePinOffset(
      upperOuterPin.offset,
      upperCcwRotationDegrees,
    )
    nextUpperPlacement.x =
      upperPlacement.x + oldUpperOuterPinOffset.x - newUpperOuterPinOffset.x
    nextUpperPlacement.y =
      upperPlacement.y + oldUpperOuterPinOffset.y - newUpperOuterPinOffset.y
    nextUpperPlacement.y += getVerticalPinClearanceOffset({
      upperPin: mainPin,
      upperPlacement: mainPlacement,
      lowerPin: upperOuterPin,
      lowerPlacement: nextUpperPlacement,
    })
  }

  chipPlacements[groundedLoadPair.upperChip.chipId] = nextUpperPlacement
  chipPlacements[groundedLoadPair.lowerChip.chipId] = {
    x: nextUpperPlacement.x + upperInnerPinOffset.x - lowerInnerPinOffset.x,
    y: nextUpperPlacement.y - centerDistance,
    ccwRotationDegrees: lowerCcwRotationDegrees,
  }

  // Keep the pair rigid while restoring chipGap from previously packed bodies.
  movePairBelowObstacles({ groundedLoadPair, chipPlacements, inputProblem })
}
