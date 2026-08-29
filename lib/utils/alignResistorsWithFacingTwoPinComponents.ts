import {
  doesSegmentIntersectRect,
  getBoundFromCenteredRect,
} from "@tscircuit/math-utils"
import type { ChipId, InputProblem, NetId, PinId } from "../types/InputProblem"
import type { Placement } from "../types/OutputLayout"
import type { Side } from "../types/Side"
import { createPinOwnerMap } from "./createPinOwnerMap"
import { getRotatedSize, rotatePinOffset } from "./rotatePinOffset"
import { tryOffsetChips } from "./offsetCollinearConnections"

const ALIGNMENT_TOLERANCE = 1e-6
const TWO_PIN_COMPONENT_PIN_COUNT = 2
const SIDE_ROTATION_ORDER = ["x+", "y+", "x-", "y-"] satisfies Side[]

type AlignmentCandidate = {
  anchorChipId: ChipId
  anchorPinId: PinId
  resistorPinId: PinId
  yDelta: number
  distanceSquared: number
}

const compareIds = (a: string, b: string): number =>
  a === b ? 0 : a < b ? -1 : 1

const getRotatedSide = (side: Side, ccwRotationDegrees: number): Side => {
  const quarterTurns = ((Math.round(ccwRotationDegrees / 90) % 4) + 4) % 4
  const index = SIDE_ROTATION_ORDER.indexOf(side)
  return SIDE_ROTATION_ORDER[(index + quarterTurns) % 4]!
}

const getAbsolutePinPosition = (
  inputProblem: InputProblem,
  pinId: PinId,
  placement: Placement,
) => {
  const pin = inputProblem.chipPinMap[pinId]!
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return { x: placement.x + offset.x, y: placement.y + offset.y }
}

const compareCandidates = (
  a: AlignmentCandidate,
  b: AlignmentCandidate,
): number => {
  return (
    a.distanceSquared - b.distanceSquared ||
    Math.abs(a.yDelta) - Math.abs(b.yDelta) ||
    compareIds(a.anchorChipId, b.anchorChipId) ||
    compareIds(a.anchorPinId, b.anchorPinId) ||
    compareIds(a.resistorPinId, b.resistorPinId)
  )
}

const segmentIsBlocked = (
  candidate: AlignmentCandidate,
  resistorChipId: ChipId,
  inputProblem: InputProblem,
  chipPlacements: Record<ChipId, Placement>,
): boolean => {
  const resistorPlacement = chipPlacements[resistorChipId]
  const anchorPlacement = chipPlacements[candidate.anchorChipId]
  if (!resistorPlacement || !anchorPlacement) {
    return true
  }

  const segmentStart = getAbsolutePinPosition(
    inputProblem,
    candidate.resistorPinId,
    resistorPlacement,
  )
  const segmentEnd = getAbsolutePinPosition(
    inputProblem,
    candidate.anchorPinId,
    anchorPlacement,
  )
  return Object.entries(chipPlacements).some(([chipId, placement]) => {
    if (chipId === resistorChipId || chipId === candidate.anchorChipId) {
      return false
    }
    const chip = inputProblem.chipMap[chipId]
    if (!chip) return false
    const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
    return doesSegmentIntersectRect(
      segmentStart,
      segmentEnd,
      getBoundFromCenteredRect({
        center: placement,
        width: size.x,
        height: size.y,
      }),
    )
  })
}

/**
 * Aligns a non-fixed resistor with the closest connected two-pin component
 * when their horizontal pins face each other and the local move is clear.
 * Only the resistor's Y coordinate may change.
 */
export const alignResistorsWithFacingTwoPinComponents = ({
  inputProblem,
  chipPlacements,
  pinToNetworkMap,
}: {
  inputProblem: InputProblem
  chipPlacements: Record<ChipId, Placement>
  pinToNetworkMap: Map<PinId, NetId>
}): void => {
  const pinOwnerMap = createPinOwnerMap(inputProblem)
  const pinIdsByNetwork = new Map<NetId, PinId[]>()
  for (const [pinId, netId] of pinToNetworkMap) {
    const pinIds = pinIdsByNetwork.get(netId) ?? []
    pinIds.push(pinId)
    pinIdsByNetwork.set(netId, pinIds)
  }

  const resistors = Object.values(inputProblem.chipMap)
    .filter(
      (chip) =>
        chip.isResistor &&
        !chip.fixedPosition &&
        chip.pins.length === TWO_PIN_COMPONENT_PIN_COUNT,
    )
    .sort((a, b) => compareIds(a.chipId, b.chipId))

  for (const resistor of resistors) {
    const resistorPlacement = chipPlacements[resistor.chipId]
    if (!resistorPlacement) continue
    const candidates: AlignmentCandidate[] = []

    for (const resistorPinId of resistor.pins) {
      const resistorPin = inputProblem.chipPinMap[resistorPinId]
      const netId = pinToNetworkMap.get(resistorPinId)
      if (!resistorPin || !netId) continue
      const resistorSide = getRotatedSide(
        resistorPin.side,
        resistorPlacement.ccwRotationDegrees,
      )
      if (resistorSide !== "x-" && resistorSide !== "x+") continue
      const facingDirection = resistorSide === "x+" ? 1 : -1
      const resistorPinPosition = getAbsolutePinPosition(
        inputProblem,
        resistorPinId,
        resistorPlacement,
      )

      for (const anchorPinId of pinIdsByNetwork.get(netId) ?? []) {
        const anchor = pinOwnerMap.get(anchorPinId)
        if (
          !anchor ||
          anchor.chipId === resistor.chipId ||
          anchor.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT
        ) {
          continue
        }
        const anchorPin = inputProblem.chipPinMap[anchorPinId]
        const anchorPlacement = chipPlacements[anchor.chipId]
        if (!anchorPin || !anchorPlacement) continue
        const anchorSide = getRotatedSide(
          anchorPin.side,
          anchorPlacement.ccwRotationDegrees,
        )
        if (
          (resistorSide === "x-" && anchorSide !== "x+") ||
          (resistorSide === "x+" && anchorSide !== "x-")
        ) {
          continue
        }

        const anchorPinPosition = getAbsolutePinPosition(
          inputProblem,
          anchorPinId,
          anchorPlacement,
        )
        const xDelta = anchorPinPosition.x - resistorPinPosition.x
        const yDelta = anchorPinPosition.y - resistorPinPosition.y
        const forwardDistance = xDelta * facingDirection
        if (
          forwardDistance <= ALIGNMENT_TOLERANCE ||
          Math.abs(yDelta) <= ALIGNMENT_TOLERANCE ||
          Math.abs(yDelta) > forwardDistance + ALIGNMENT_TOLERANCE
        ) {
          continue
        }
        candidates.push({
          anchorChipId: anchor.chipId,
          anchorPinId,
          resistorPinId,
          yDelta,
          distanceSquared: xDelta * xDelta + yDelta * yDelta,
        })
      }
    }

    candidates.sort(compareCandidates)
    const candidate = candidates[0]
    if (!candidate) continue
    const originalY = resistorPlacement.y
    if (
      !tryOffsetChips({
        chipIds: [resistor.chipId],
        dx: 0,
        dy: candidate.yDelta,
        chipPlacements,
        inputProblem,
      })
    ) {
      continue
    }
    if (
      segmentIsBlocked(candidate, resistor.chipId, inputProblem, chipPlacements)
    ) {
      resistorPlacement.y = originalY
    }
  }
}
