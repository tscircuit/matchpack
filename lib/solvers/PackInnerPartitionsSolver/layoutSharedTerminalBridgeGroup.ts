import {
  type Bounds,
  boundsDistance,
  getBoundFromCenteredRect,
  getUnitVectorFromDirection,
  type Point,
} from "@tscircuit/math-utils"
import type {
  Chip,
  ChipId,
  InputProblem,
  PinId,
} from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import type {
  SeriesBranchComponent,
  SharedTerminalBridgeGroup,
} from "./findSharedTerminalBridgeGroups"

const DEFAULT_ROTATIONS: NonNullable<Chip["availableRotations"]> = [
  0, 90, 180, 270,
]
const CLEARANCE_EPSILON = 1e-6

type LayoutAxes = {
  outward: Point
  tangent: Point
}

const dot = (point: Point, axis: Point): number =>
  point.x * axis.x + point.y * axis.y

const getLayoutAxes = ({ pinOffset }: { pinOffset: Point }): LayoutAxes => {
  if (Math.abs(pinOffset.x) >= Math.abs(pinOffset.y)) {
    return {
      outward: getUnitVectorFromDirection(pinOffset.x >= 0 ? "right" : "left"),
      tangent: getUnitVectorFromDirection("up"),
    }
  }
  return {
    outward: getUnitVectorFromDirection(pinOffset.y >= 0 ? "up" : "down"),
    tangent: getUnitVectorFromDirection("right"),
  }
}

const getBounds = ({
  chip,
  placement,
}: {
  chip: Chip
  placement: Placement
}): Bounds => {
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })
}

const candidateHasClearance = ({
  candidatePlacements,
  originalPlacements,
  inputProblem,
}: {
  candidatePlacements: Record<ChipId, Placement>
  originalPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): boolean => {
  const candidateChipIds = new Set(Object.keys(candidatePlacements))
  const candidateEntries = Object.entries(candidatePlacements)

  for (let index = 0; index < candidateEntries.length; index++) {
    const [chipId, placement] = candidateEntries[index]!
    const chip = inputProblem.chipMap[chipId]
    if (!chip) return false
    const bounds = getBounds({ chip, placement })

    for (let inner = index + 1; inner < candidateEntries.length; inner++) {
      const [otherChipId, otherPlacement] = candidateEntries[inner]!
      const otherChip = inputProblem.chipMap[otherChipId]
      if (
        !otherChip ||
        boundsDistance(
          bounds,
          getBounds({ chip: otherChip, placement: otherPlacement }),
        ) <
          inputProblem.chipGap - CLEARANCE_EPSILON
      ) {
        return false
      }
    }

    for (const [otherChipId, otherPlacement] of Object.entries(
      originalPlacements,
    )) {
      if (candidateChipIds.has(otherChipId)) continue
      const otherChip = inputProblem.chipMap[otherChipId]
      if (
        !otherChip ||
        boundsDistance(
          bounds,
          getBounds({ chip: otherChip, placement: otherPlacement }),
        ) <
          inputProblem.chipGap - CLEARANCE_EPSILON
      ) {
        return false
      }
    }
  }

  return true
}

/**
 * Reflow a shared terminal bridge group into two parallel vertical branches
 * with the 3-pin bridge component placed above them and its power pin pointing
 * upward (positive voltage rail bias).
 *
 * Returns null if the layout cannot preserve the required chip gap clearance.
 */
export const layoutSharedTerminalBridgeGroup = ({
  group,
  chipPlacements,
  inputProblem,
}: {
  group: SharedTerminalBridgeGroup
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): Record<ChipId, Placement> | null => {
  const mainChip = inputProblem.chipMap[group.mainChipId]
  const mainPlacement = chipPlacements[group.mainChipId]
  const termChip = inputProblem.chipMap[group.terminalChipId]
  const powerPin = inputProblem.chipPinMap[group.terminalPowerPinId]
  if (!mainChip || !mainPlacement || !termChip || !powerPin) return null

  const mainPin0 = inputProblem.chipPinMap[group.mainPinIds[0]]
  const mainPin1 = inputProblem.chipPinMap[group.mainPinIds[1]]
  if (!mainPin0 || !mainPin1) return null

  const rotatedMainPinOffset = rotatePinOffset(
    mainPin0.offset,
    mainPlacement.ccwRotationDegrees,
  )
  const axes = getLayoutAxes({ pinOffset: rotatedMainPinOffset })

  // Select rotation for terminal chip that biases power pin upward (+y)
  const termRotations = termChip.availableRotations ?? DEFAULT_ROTATIONS
  let bestTermRotation = termRotations[0] ?? 0
  let bestTermScore = Number.NEGATIVE_INFINITY

  for (const rot of termRotations) {
    const rotOffset = rotatePinOffset(powerPin.offset, rot)
    // Primary goal: point in +y. Secondary tie-breaker: prefer rot 0.
    const score = rotOffset.y * 10 - (rot === 0 ? 0 : 0.1)
    if (score > bestTermScore) {
      bestTermScore = score
      bestTermRotation = rot
    }
  }

  // Inspect the terminal branch pin offsets to align left-to-left and right-to-right
  const termBranchPin0 = inputProblem.chipPinMap[group.terminalBranchPinIds[0]]
  const termBranchPin1 = inputProblem.chipPinMap[group.terminalBranchPinIds[1]]
  if (!termBranchPin0 || !termBranchPin1) return null

  const rotOffset0 = rotatePinOffset(termBranchPin0.offset, bestTermRotation)
  const rotOffset1 = rotatePinOffset(termBranchPin1.offset, bestTermRotation)

  let leftBranch: SeriesBranchComponent
  let rightBranch: SeriesBranchComponent

  if (rotOffset0.x <= rotOffset1.x) {
    leftBranch = group.branches[0]
    rightBranch = group.branches[1]
  } else {
    leftBranch = group.branches[1]
    rightBranch = group.branches[0]
  }

  // Choose rotation for branch components: vertical, farPin facing upward towards terminal bridge
  const getBranchRotation = (branch: SeriesBranchComponent): number => {
    const chip = inputProblem.chipMap[branch.chipId]
    const farPin = inputProblem.chipPinMap[branch.farPinId]
    if (!chip || !farPin) return 0

    const rotations = chip.availableRotations ?? DEFAULT_ROTATIONS
    let bestRot = rotations[0] ?? 0
    let bestScore = Number.NEGATIVE_INFINITY

    for (const rot of rotations) {
      const size = getRotatedSize(chip.size, rot)
      const isVertical = size.y >= size.x
      const farOffset = rotatePinOffset(farPin.offset, rot)
      // Strongly prefer vertical orientation and farPin pointing upward (+y)
      const score = (isVertical ? 10 : 0) + farOffset.y * 5
      if (score > bestScore) {
        bestScore = score
        bestRot = rot
      }
    }
    return bestRot
  }

  const leftRot = getBranchRotation(leftBranch)
  const rightRot = getBranchRotation(rightBranch)

  const leftChip = inputProblem.chipMap[leftBranch.chipId]
  const rightChip = inputProblem.chipMap[rightBranch.chipId]
  if (!leftChip || !rightChip) return null

  const leftSize = getRotatedSize(leftChip.size, leftRot)
  const rightSize = getRotatedSize(rightChip.size, rightRot)
  const termSize = getRotatedSize(termChip.size, bestTermRotation)

  const chipGap = inputProblem.chipGap
  const mainRotatedSize = getRotatedSize(
    mainChip.size,
    mainPlacement.ccwRotationDegrees,
  )

  const pin0Rot = rotatePinOffset(
    mainPin0.offset,
    mainPlacement.ccwRotationDegrees,
  )
  const pin1Rot = rotatePinOffset(
    mainPin1.offset,
    mainPlacement.ccwRotationDegrees,
  )
  const avgPinY = mainPlacement.y + (pin0Rot.y + pin1Rot.y) / 2
  const branchHeight = Math.max(leftSize.y, rightSize.y)
  const branchY = avgPinY + branchHeight / 2 - 0.1
  const topOfBranches = branchY + branchHeight / 2
  const termY = topOfBranches + chipGap + termSize.y / 2

  // Try placing at default gap, then try outward offsets if obstructed
  const outwardOffsets = [0, chipGap, chipGap * 2]

  for (const extraGap of outwardOffsets) {
    let leftX: number
    let rightX: number

    if (axes.outward.x >= 0) {
      // Branches extend to the right (x+)
      const mainRightEdge = mainPlacement.x + mainRotatedSize.x / 2
      leftX = mainRightEdge + chipGap + leftSize.x / 2 + extraGap
      rightX = leftX + leftSize.x / 2 + chipGap + rightSize.x / 2
    } else {
      // Branches extend to the left (x-)
      const mainLeftEdge = mainPlacement.x - mainRotatedSize.x / 2
      const innerX = mainLeftEdge - chipGap - rightSize.x / 2 - extraGap
      const outerX = innerX - rightSize.x / 2 - chipGap - leftSize.x / 2
      leftX = outerX
      rightX = innerX
    }

    const termX = (leftX + rightX) / 2

    const candidatePlacements: Record<ChipId, Placement> = {
      [leftBranch.chipId]: {
        x: leftX,
        y: branchY,
        ccwRotationDegrees: leftRot,
      },
      [rightBranch.chipId]: {
        x: rightX,
        y: branchY,
        ccwRotationDegrees: rightRot,
      },
      [group.terminalChipId]: {
        x: termX,
        y: termY,
        ccwRotationDegrees: bestTermRotation,
      },
    }

    if (
      candidateHasClearance({
        candidatePlacements,
        originalPlacements: chipPlacements,
        inputProblem,
      })
    ) {
      return candidatePlacements
    }
  }

  return null
}
