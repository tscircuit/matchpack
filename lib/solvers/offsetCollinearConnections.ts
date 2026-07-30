import { boundsDistance, getBoundFromCenteredRect } from "@tscircuit/math-utils"
import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  PinId,
} from "../types/InputProblem"
import type { Placement } from "../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../utils/rotatePinOffset"
import { getGroundedLoadPairs } from "./GroundedLoadPairSolver/getGroundedLoadPairs"

const TRACE_CLEARANCE = 0.2
const ALIGNMENT_TOLERANCE = 1e-6
const TWO_PIN_COMPONENT_PIN_COUNT = 2

const getAbsolutePinPosition = (
  pin: ChipPin,
  placement: Placement,
): { x: number; y: number } => {
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return {
    x: placement.x + offset.x,
    y: placement.y + offset.y,
  }
}

const getPinOwnerMap = (inputProblem: InputProblem) => {
  const pinOwnerMap = new Map<PinId, Chip>()
  for (const chip of Object.values(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinOwnerMap.set(pinId, chip)
  }
  return pinOwnerMap
}

const pinConnectsToGround = (
  inputProblem: InputProblem,
  pinId: PinId,
): boolean => {
  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (!net.isGround) continue
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) return true
  }
  return false
}

const chipPinsAreVerticallyOriented = ({
  chip,
  inputProblem,
  placement,
}: {
  chip: Chip
  inputProblem: InputProblem
  placement: Placement
}): boolean => {
  const [firstPinId, secondPinId] = chip.pins
  const firstPin = firstPinId && inputProblem.chipPinMap[firstPinId]
  const secondPin = secondPinId && inputProblem.chipPinMap[secondPinId]
  if (!firstPin || !secondPin) return false
  const firstOffset = rotatePinOffset(
    firstPin.offset,
    placement.ccwRotationDegrees,
  )
  const secondOffset = rotatePinOffset(
    secondPin.offset,
    placement.ccwRotationDegrees,
  )
  return (
    Math.abs(firstOffset.y - secondOffset.y) >
    Math.abs(firstOffset.x - secondOffset.x)
  )
}

const placementHasClearance = ({
  chipId,
  chipPlacements,
  inputProblem,
}: {
  chipId: ChipId
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): boolean => {
  const chip = inputProblem.chipMap[chipId]
  const placement = chipPlacements[chipId]
  if (!chip || !placement) return false

  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  const bounds = getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })

  for (const [otherChipId, otherPlacement] of Object.entries(chipPlacements)) {
    if (otherChipId === chipId) continue
    const otherChip = inputProblem.chipMap[otherChipId]
    if (!otherChip) continue
    const otherSize = getRotatedSize(
      otherChip.size,
      otherPlacement.ccwRotationDegrees,
    )
    const otherBounds = getBoundFromCenteredRect({
      center: otherPlacement,
      width: otherSize.x,
      height: otherSize.y,
    })
    if (
      boundsDistance(bounds, otherBounds) <
      inputProblem.chipGap - ALIGNMENT_TOLERANCE
    ) {
      return false
    }
  }

  return true
}

const tryOffsetChip = ({
  chipId,
  dx,
  dy,
  chipPlacements,
  inputProblem,
}: {
  chipId: ChipId
  dx: number
  dy: number
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): void => {
  const placement = chipPlacements[chipId]
  if (!placement) return

  placement.x += dx
  placement.y += dy
  if (
    !placementHasClearance({
      chipId,
      chipPlacements,
      inputProblem,
    })
  ) {
    placement.x -= dx
    placement.y -= dy
  }
}

export const applyDirectPassiveTraceClearance = ({
  inputProblem,
  connectedPinsByPinId,
  chipPlacements,
}: {
  inputProblem: InputProblem
  connectedPinsByPinId: Record<PinId, ChipPin[]>
  chipPlacements: Record<ChipId, Placement>
}): void => {
  const pinOwnerMap = getPinOwnerMap(inputProblem)
  const chipCount = Object.keys(inputProblem.chipMap).length

  for (const mainChip of Object.values(inputProblem.chipMap)) {
    if (mainChip.pins.length <= TWO_PIN_COMPONENT_PIN_COUNT) continue

    for (const mainPinId of mainChip.pins) {
      for (const connectedPin of connectedPinsByPinId[mainPinId] ?? []) {
        const connectedChip = pinOwnerMap.get(connectedPin.pinId)
        if (!connectedChip) continue
        if (connectedChip.fixedPosition) continue
        if (connectedChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) {
          continue
        }

        const mainPin = inputProblem.chipPinMap[mainPinId]
        const mainPlacement = chipPlacements[mainChip.chipId]
        const connectedPlacement = chipPlacements[connectedChip.chipId]
        if (!mainPin || !mainPlacement || !connectedPlacement) continue

        const mainPinPosition = getAbsolutePinPosition(mainPin, mainPlacement)
        const connectedPinPosition = getAbsolutePinPosition(
          connectedPin,
          connectedPlacement,
        )
        const pinsShareX =
          Math.abs(mainPinPosition.x - connectedPinPosition.x) <=
          ALIGNMENT_TOLERANCE
        const pinsShareY =
          Math.abs(mainPinPosition.y - connectedPinPosition.y) <=
          ALIGNMENT_TOLERANCE
        const pinsAreVerticallyOriented = chipPinsAreVerticallyOriented({
          chip: connectedChip,
          inputProblem,
          placement: connectedPlacement,
        })

        if (pinsShareX && pinsAreVerticallyOriented) {
          tryOffsetChip({
            chipId: connectedChip.chipId,
            dx: -TRACE_CLEARANCE,
            dy: 0,
            chipPlacements,
            inputProblem,
          })
          continue
        }

        const otherPinId = connectedChip.pins.find(
          (pinId) => pinId !== connectedPin.pinId,
        )
        const isSingleVerticalPassive =
          chipCount === TWO_PIN_COMPONENT_PIN_COUNT &&
          pinsAreVerticallyOriented &&
          (connectedChip.isCapacitor || connectedChip.isResistor)
        const isGroundedLoad =
          otherPinId && pinConnectsToGround(inputProblem, otherPinId)
        if (pinsShareY && (isSingleVerticalPassive || isGroundedLoad)) {
          tryOffsetChip({
            chipId: connectedChip.chipId,
            dx: 0,
            dy: -TRACE_CLEARANCE,
            chipPlacements,
            inputProblem,
          })
        }
      }
    }
  }
}

export const offsetCollinearGroundedResistorLoads = ({
  inputProblem,
  chipPlacements,
}: {
  inputProblem: InputProblem
  chipPlacements: Record<ChipId, Placement>
}): void => {
  for (const groundedLoadPair of getGroundedLoadPairs(inputProblem)) {
    if (!groundedLoadPair.upperChip.isResistor) continue

    const upperPin = inputProblem.chipPinMap[groundedLoadPair.upperInnerPinId]
    const lowerPin = inputProblem.chipPinMap[groundedLoadPair.lowerInnerPinId]
    const upperPlacement = chipPlacements[groundedLoadPair.upperChip.chipId]
    const lowerPlacement = chipPlacements[groundedLoadPair.lowerChip.chipId]
    if (!upperPin || !lowerPin || !upperPlacement || !lowerPlacement) continue

    const upperPinPosition = getAbsolutePinPosition(upperPin, upperPlacement)
    const lowerPinPosition = getAbsolutePinPosition(lowerPin, lowerPlacement)
    if (
      Math.abs(upperPinPosition.x - lowerPinPosition.x) > ALIGNMENT_TOLERANCE
    ) {
      continue
    }

    tryOffsetChip({
      chipId: groundedLoadPair.upperChip.chipId,
      dx: -TRACE_CLEARANCE,
      dy: 0,
      chipPlacements,
      inputProblem,
    })
  }
}
