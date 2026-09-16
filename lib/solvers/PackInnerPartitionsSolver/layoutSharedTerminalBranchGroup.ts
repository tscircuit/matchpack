import {
  type Bounds,
  boundsDistance,
  getBoundFromCenteredRect,
  type Point,
} from "@tscircuit/math-utils"
import type { Chip, ChipId, InputProblem, PinId } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import type {
  SharedTerminalBranch,
  SharedTerminalBranchGroup,
} from "./findSharedTerminalBranchGroups"

const DEFAULT_ROTATIONS = [0, 90, 180, 270] as const
const EPSILON = 1e-6
const CROSSING_PENALTY = 1000

type LayoutAxes = {
  outward: Point
  tangent: Point
}

type Segment = {
  start: Point
  end: Point
}

type BranchCandidate = {
  branch: SharedTerminalBranch
  chip: Chip
  placement: Placement
  halfTangentExtent: number
}

const dot = (point: Point, axis: Point): number =>
  point.x * axis.x + point.y * axis.y

const pointFromAxes = ({
  outwardCoordinate,
  tangentCoordinate,
  axes,
}: {
  outwardCoordinate: number
  tangentCoordinate: number
  axes: LayoutAxes
}): Point => ({
  x:
    axes.outward.x * outwardCoordinate +
    axes.tangent.x * tangentCoordinate,
  y:
    axes.outward.y * outwardCoordinate +
    axes.tangent.y * tangentCoordinate,
})

const getLayoutAxes = (pinOffset: Point): LayoutAxes => {
  if (Math.abs(pinOffset.x) >= Math.abs(pinOffset.y)) {
    return {
      outward: { x: pinOffset.x >= 0 ? 1 : -1, y: 0 },
      tangent: { x: 0, y: 1 },
    }
  }
  return {
    outward: { x: 0, y: pinOffset.y >= 0 ? 1 : -1 },
    tangent: { x: 1, y: 0 },
  }
}

const getHalfExtent = (size: Point, axis: Point): number =>
  (Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y) / 2

const getBounds = (chip: Chip, placement: Placement): Bounds => {
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })
}

const getPinPosition = ({
  chipId,
  pinId,
  placements,
  inputProblem,
}: {
  chipId: ChipId
  pinId: PinId
  placements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): Point | null => {
  const placement = placements[chipId]
  const pin = inputProblem.chipPinMap[pinId]
  if (!placement || !pin) return null
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return {
    x: placement.x + offset.x,
    y: placement.y + offset.y,
  }
}

const chooseOutwardRotation = ({
  branch,
  chip,
  originalPlacement,
  inputProblem,
  outward,
}: {
  branch: SharedTerminalBranch
  chip: Chip
  originalPlacement: Placement
  inputProblem: InputProblem
  outward: Point
}): number | null => {
  const nearPin = inputProblem.chipPinMap[branch.nearPinId]
  const farPin = inputProblem.chipPinMap[branch.farPinId]
  if (!nearPin || !farPin) return null

  const rotations = chip.availableRotations ?? [...DEFAULT_ROTATIONS]
  let bestRotation: number | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const rotation of rotations) {
    const nearOffset = rotatePinOffset(nearPin.offset, rotation)
    const farOffset = rotatePinOffset(farPin.offset, rotation)
    const score = dot(
      {
        x: farOffset.x - nearOffset.x,
        y: farOffset.y - nearOffset.y,
      },
      outward,
    )
    if (
      score > bestScore + EPSILON ||
      (Math.abs(score - bestScore) <= EPSILON &&
        rotation === originalPlacement.ccwRotationDegrees)
    ) {
      bestScore = score
      bestRotation = rotation
    }
  }

  return bestScore > EPSILON ? bestRotation : null
}

const hasClearance = ({
  candidatePlacements,
  originalPlacements,
  inputProblem,
}: {
  candidatePlacements: Record<ChipId, Placement>
  originalPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): boolean => {
  const candidateIds = new Set(Object.keys(candidatePlacements))
  const candidateEntries = Object.entries(candidatePlacements)

  for (let index = 0; index < candidateEntries.length; index++) {
    const [chipId, placement] = candidateEntries[index]!
    const chip = inputProblem.chipMap[chipId]
    if (!chip) return false
    const bounds = getBounds(chip, placement)

    for (
      let otherIndex = index + 1;
      otherIndex < candidateEntries.length;
      otherIndex++
    ) {
      const [otherChipId, otherPlacement] = candidateEntries[otherIndex]!
      const otherChip = inputProblem.chipMap[otherChipId]
      if (
        !otherChip ||
        boundsDistance(bounds, getBounds(otherChip, otherPlacement)) <
          inputProblem.chipGap - EPSILON
      ) {
        return false
      }
    }

    for (const [otherChipId, otherPlacement] of Object.entries(
      originalPlacements,
    )) {
      if (candidateIds.has(otherChipId)) continue
      const otherChip = inputProblem.chipMap[otherChipId]
      if (
        !otherChip ||
        boundsDistance(bounds, getBounds(otherChip, otherPlacement)) <
          inputProblem.chipGap - EPSILON
      ) {
        return false
      }
    }
  }

  return true
}

const pointsEqual = (first: Point, second: Point): boolean =>
  Math.abs(first.x - second.x) <= EPSILON &&
  Math.abs(first.y - second.y) <= EPSILON

const cross = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

const segmentsProperlyIntersect = (first: Segment, second: Segment): boolean => {
  if (
    pointsEqual(first.start, second.start) ||
    pointsEqual(first.start, second.end) ||
    pointsEqual(first.end, second.start) ||
    pointsEqual(first.end, second.end)
  ) {
    return false
  }

  const a = cross(first.start, first.end, second.start)
  const b = cross(first.start, first.end, second.end)
  const c = cross(second.start, second.end, first.start)
  const d = cross(second.start, second.end, first.end)
  return a * b < -EPSILON && c * d < -EPSILON
}

const getGroupSegments = ({
  group,
  placements,
  inputProblem,
}: {
  group: SharedTerminalBranchGroup
  placements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): Segment[] | null => {
  const segments: Segment[] = []

  for (const branch of group.branches) {
    const mainPin = getPinPosition({
      chipId: group.mainChipId,
      pinId: branch.mainPinId,
      placements,
      inputProblem,
    })
    const nearPin = getPinPosition({
      chipId: branch.chipId,
      pinId: branch.nearPinId,
      placements,
      inputProblem,
    })
    const farPin = getPinPosition({
      chipId: branch.chipId,
      pinId: branch.farPinId,
      placements,
      inputProblem,
    })
    const terminalPin = getPinPosition({
      chipId: group.terminalChipId,
      pinId: branch.terminalPinId,
      placements,
      inputProblem,
    })
    if (!mainPin || !nearPin || !farPin || !terminalPin) return null

    segments.push(
      { start: mainPin, end: nearPin },
      { start: farPin, end: terminalPin },
    )
  }

  return segments
}

const getLayoutScore = (segments: Segment[]): number => {
  let totalLength = 0
  let crossings = 0

  for (const segment of segments) {
    totalLength +=
      Math.abs(segment.start.x - segment.end.x) +
      Math.abs(segment.start.y - segment.end.y)
  }

  for (let firstIndex = 0; firstIndex < segments.length; firstIndex++) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < segments.length;
      secondIndex++
    ) {
      if (
        segmentsProperlyIntersect(
          segments[firstIndex]!,
          segments[secondIndex]!,
        )
      ) {
        crossings++
      }
    }
  }

  return crossings * CROSSING_PENALTY + totalLength
}

/**
 * Reflow a pair of two-pin branches and their shared terminal as one local
 * structure. The generic packed result is retained unless a candidate keeps
 * chip clearance and strictly improves the local Manhattan/crossing score.
 */
export const layoutSharedTerminalBranchGroup = ({
  group,
  chipPlacements,
  inputProblem,
}: {
  group: SharedTerminalBranchGroup
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): Record<ChipId, Placement> | null => {
  const mainChip = inputProblem.chipMap[group.mainChipId]
  const mainPlacement = chipPlacements[group.mainChipId]
  const terminalChip = inputProblem.chipMap[group.terminalChipId]
  const terminalOriginalPlacement = chipPlacements[group.terminalChipId]
  const firstMainPin = inputProblem.chipPinMap[group.branches[0].mainPinId]
  if (
    !mainChip ||
    !mainPlacement ||
    !terminalChip ||
    !terminalOriginalPlacement ||
    !firstMainPin
  ) {
    return null
  }

  const firstMainPinOffset = rotatePinOffset(
    firstMainPin.offset,
    mainPlacement.ccwRotationDegrees,
  )
  const axes = getLayoutAxes(firstMainPinOffset)
  const mainSize = getRotatedSize(
    mainChip.size,
    mainPlacement.ccwRotationDegrees,
  )
  const mainOuterBodyCoordinate =
    dot(mainPlacement, axes.outward) +
    getHalfExtent(mainSize, axes.outward)

  const branchCandidates: BranchCandidate[] = []
  for (const branch of group.branches) {
    const chip = inputProblem.chipMap[branch.chipId]
    const originalPlacement = chipPlacements[branch.chipId]
    const mainPin = inputProblem.chipPinMap[branch.mainPinId]
    const nearPin = inputProblem.chipPinMap[branch.nearPinId]
    if (!chip || !originalPlacement || !mainPin || !nearPin) return null

    const rotation = chooseOutwardRotation({
      branch,
      chip,
      originalPlacement,
      inputProblem,
      outward: axes.outward,
    })
    if (rotation === null) return null

    const size = getRotatedSize(chip.size, rotation)
    const halfOutwardExtent = getHalfExtent(size, axes.outward)
    const halfTangentExtent = getHalfExtent(size, axes.tangent)
    const mainPinOffset = rotatePinOffset(
      mainPin.offset,
      mainPlacement.ccwRotationDegrees,
    )
    const mainPinPosition = {
      x: mainPlacement.x + mainPinOffset.x,
      y: mainPlacement.y + mainPinOffset.y,
    }
    const nearPinOffset = rotatePinOffset(nearPin.offset, rotation)

    const clearanceOutwardCoordinate =
      mainOuterBodyCoordinate + inputProblem.chipGap + halfOutwardExtent
    const alignedOutwardCoordinate =
      dot(mainPinPosition, axes.outward) -
      dot(nearPinOffset, axes.outward)
    const outwardCoordinate = Math.max(
      clearanceOutwardCoordinate,
      alignedOutwardCoordinate,
    )
    const tangentCoordinate =
      dot(mainPinPosition, axes.tangent) -
      dot(nearPinOffset, axes.tangent)
    const center = pointFromAxes({
      outwardCoordinate,
      tangentCoordinate,
      axes,
    })

    branchCandidates.push({
      branch,
      chip,
      placement: {
        ...center,
        ccwRotationDegrees: rotation,
      },
      halfTangentExtent,
    })
  }

  branchCandidates.sort(
    (first, second) =>
      dot(first.placement, axes.tangent) -
      dot(second.placement, axes.tangent),
  )

  const firstBranch = branchCandidates[0]!
  const secondBranch = branchCandidates[1]!
  const firstTangent = dot(firstBranch.placement, axes.tangent)
  const secondTangent = dot(secondBranch.placement, axes.tangent)
  const requiredSeparation =
    firstBranch.halfTangentExtent +
    secondBranch.halfTangentExtent +
    inputProblem.chipGap
  const actualSeparation = secondTangent - firstTangent
  if (actualSeparation < requiredSeparation) {
    const shift = (requiredSeparation - actualSeparation) / 2
    firstBranch.placement.x -= axes.tangent.x * shift
    firstBranch.placement.y -= axes.tangent.y * shift
    secondBranch.placement.x += axes.tangent.x * shift
    secondBranch.placement.y += axes.tangent.y * shift
  }

  const baseSegments = getGroupSegments({
    group,
    placements: chipPlacements,
    inputProblem,
  })
  if (!baseSegments) return null
  const baseScore = getLayoutScore(baseSegments)

  let bestPlacements: Record<ChipId, Placement> | null = null
  let bestScore = baseScore
  const terminalRotations =
    terminalChip.availableRotations ?? [...DEFAULT_ROTATIONS]

  for (const terminalRotation of terminalRotations) {
    const terminalSize = getRotatedSize(terminalChip.size, terminalRotation)
    const terminalHalfOutwardExtent = getHalfExtent(
      terminalSize,
      axes.outward,
    )

    let branchOuterBodyCoordinate = Number.NEGATIVE_INFINITY
    const terminalTangentCenters: number[] = []

    for (const branchCandidate of branchCandidates) {
      const branchSize = getRotatedSize(
        branchCandidate.chip.size,
        branchCandidate.placement.ccwRotationDegrees,
      )
      branchOuterBodyCoordinate = Math.max(
        branchOuterBodyCoordinate,
        dot(branchCandidate.placement, axes.outward) +
          getHalfExtent(branchSize, axes.outward),
      )

      const farPin = inputProblem.chipPinMap[branchCandidate.branch.farPinId]
      const terminalPin =
        inputProblem.chipPinMap[branchCandidate.branch.terminalPinId]
      if (!farPin || !terminalPin) return null

      const farOffset = rotatePinOffset(
        farPin.offset,
        branchCandidate.placement.ccwRotationDegrees,
      )
      const farPinPosition = {
        x: branchCandidate.placement.x + farOffset.x,
        y: branchCandidate.placement.y + farOffset.y,
      }
      const terminalPinOffset = rotatePinOffset(
        terminalPin.offset,
        terminalRotation,
      )
      terminalTangentCenters.push(
        dot(farPinPosition, axes.tangent) -
          dot(terminalPinOffset, axes.tangent),
      )
    }

    const terminalOutwardCoordinate =
      branchOuterBodyCoordinate +
      inputProblem.chipGap +
      terminalHalfOutwardExtent
    const terminalTangentCoordinate =
      terminalTangentCenters.reduce((sum, value) => sum + value, 0) /
      terminalTangentCenters.length
    const terminalCenter = pointFromAxes({
      outwardCoordinate: terminalOutwardCoordinate,
      tangentCoordinate: terminalTangentCoordinate,
      axes,
    })

    const candidatePlacements: Record<ChipId, Placement> = {
      [firstBranch.branch.chipId]: { ...firstBranch.placement },
      [secondBranch.branch.chipId]: { ...secondBranch.placement },
      [group.terminalChipId]: {
        ...terminalCenter,
        ccwRotationDegrees: terminalRotation,
      },
    }

    if (
      !hasClearance({
        candidatePlacements,
        originalPlacements: chipPlacements,
        inputProblem,
      })
    ) {
      continue
    }

    const mergedPlacements = {
      ...chipPlacements,
      ...candidatePlacements,
    }
    const segments = getGroupSegments({
      group,
      placements: mergedPlacements,
      inputProblem,
    })
    if (!segments) continue

    const score = getLayoutScore(segments)
    if (score < bestScore - EPSILON) {
      bestScore = score
      bestPlacements = candidatePlacements
    }
  }

  return bestPlacements
}
