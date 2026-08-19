import { boundsDistance, getBoundFromCenteredRect } from "@tscircuit/math-utils"
import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  PinId,
} from "../types/InputProblem"
import type { Placement } from "../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "./rotatePinOffset"
import type { GroundedLoadPair } from "../solvers/GroundedLoadPairSolver/getGroundedLoadPairs"
import { createPinOwnerMap } from "./createPinOwnerMap"
import type { ChipConnectedRailLoadPair } from "../solvers/AlignChipConnectedRailLoadsSolver/getChipConnectedRailLoadPairs"

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
  ignoredChipIds,
  inputProblem,
  minimumGap,
}: {
  chipId: ChipId
  chipPlacements: Record<ChipId, Placement>
  ignoredChipIds: Set<ChipId>
  inputProblem: InputProblem
  minimumGap: number
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
    if (ignoredChipIds.has(otherChipId)) continue
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
      minimumGap - ALIGNMENT_TOLERANCE
    ) {
      return false
    }
  }

  return true
}

export const tryOffsetChips = ({
  chipIds,
  clearanceGroupChipIds,
  dx,
  dy,
  chipPlacements,
  inputProblem,
  minimumOutsideGap,
}: {
  chipIds: ChipId[]
  clearanceGroupChipIds?: ChipId[]
  dx: number
  dy: number
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
  minimumOutsideGap?: number
}): boolean => {
  const placements = chipIds
    .map((chipId) => chipPlacements[chipId])
    .filter((placement): placement is Placement => Boolean(placement))
  if (placements.length !== chipIds.length) return false

  for (const placement of placements) {
    placement.x += dx
    placement.y += dy
  }
  const ignoredChipIds = new Set(clearanceGroupChipIds ?? chipIds)
  const allChipsHaveClearance = chipIds.every((chipId) =>
    placementHasClearance({
      chipId,
      chipPlacements,
      ignoredChipIds,
      inputProblem,
      minimumGap: minimumOutsideGap ?? inputProblem.chipGap,
    }),
  )
  if (allChipsHaveClearance) return true

  for (const placement of placements) {
    placement.x -= dx
    placement.y -= dy
  }
  return false
}

export const applyDirectPassiveTraceClearance = ({
  inputProblem,
  connectedPinsByPinId,
  chipPlacements,
  rigidChipGroups = [],
}: {
  inputProblem: InputProblem
  connectedPinsByPinId: Record<PinId, ChipPin[]>
  chipPlacements: Record<ChipId, Placement>
  rigidChipGroups?: ChipId[][]
}): void => {
  const pinOwnerMap = createPinOwnerMap(inputProblem)
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
        const rigidChipGroup = rigidChipGroups.find((chipIds) =>
          chipIds.includes(connectedChip.chipId),
        )
        const chipIdsToOffset = rigidChipGroup ?? [connectedChip.chipId]

        if (pinsShareX && pinsAreVerticallyOriented) {
          // A rigid row keeps its intentional vertical anchor trace straight.
          if (rigidChipGroup) continue
          tryOffsetChips({
            chipIds: [connectedChip.chipId],
            dx: -TRACE_CLEARANCE,
            dy: 0,
            chipPlacements,
            inputProblem,
          })
          continue
        }

        const isSingleVerticalPassive =
          chipCount === TWO_PIN_COMPONENT_PIN_COUNT &&
          pinsAreVerticallyOriented &&
          (connectedChip.isCapacitor || connectedChip.isResistor)
        const otherPinId = connectedChip.pins.find(
          (pinId) => pinId !== connectedPin.pinId,
        )
        const isGroundedLoad =
          otherPinId && pinConnectsToGround(inputProblem, otherPinId)
        if (pinsShareY && (isSingleVerticalPassive || isGroundedLoad)) {
          tryOffsetChips({
            chipIds: chipIdsToOffset,
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

export const offsetChipAnchoredGroundedLoadConnections = ({
  groundedLoadPairs,
  inputProblem,
  chipPlacements,
}: {
  groundedLoadPairs: GroundedLoadPair[]
  inputProblem: InputProblem
  chipPlacements: Record<ChipId, Placement>
}): void => {
  for (const groundedLoadPair of groundedLoadPairs) {
    if (!groundedLoadPair.mainPinId) continue
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

    tryOffsetChips({
      chipIds: [groundedLoadPair.upperChip.chipId],
      dx: -TRACE_CLEARANCE,
      dy: 0,
      chipPlacements,
      inputProblem,
    })
  }
}

export const offsetChipConnectedRailLoadConnections = ({
  railLoadPairs,
  inputProblem,
  chipPlacements,
}: {
  railLoadPairs: ChipConnectedRailLoadPair[]
  inputProblem: InputProblem
  chipPlacements: Record<ChipId, Placement>
}): void => {
  for (const railLoadPair of railLoadPairs) {
    const mainPin = inputProblem.chipPinMap[railLoadPair.mainPinId]
    const resistorPin = inputProblem.chipPinMap[railLoadPair.resistorMainPinId]
    const mainPlacement = chipPlacements[railLoadPair.mainChipId]
    const resistorPlacement = chipPlacements[railLoadPair.resistor.chipId]
    if (!mainPin || !resistorPin || !mainPlacement || !resistorPlacement) {
      continue
    }

    const mainPinPosition = getAbsolutePinPosition(mainPin, mainPlacement)
    const resistorPinPosition = getAbsolutePinPosition(
      resistorPin,
      resistorPlacement,
    )
    if (
      Math.abs(mainPinPosition.y - resistorPinPosition.y) > ALIGNMENT_TOLERANCE
    ) {
      continue
    }

    // Preserve the branch geometry while creating trace clearance at the IC pin.
    tryOffsetChips({
      chipIds: [
        railLoadPair.railComponent.chipId,
        railLoadPair.resistor.chipId,
      ],
      dx: 0,
      dy: TRACE_CLEARANCE,
      chipPlacements,
      inputProblem,
    })
  }
}
