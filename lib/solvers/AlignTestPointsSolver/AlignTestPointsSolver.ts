import {
  boundsAreaOverlap,
  doesSegmentIntersectRect,
  getBoundFromCenteredRect,
  type Point,
} from "@tscircuit/math-utils"
import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { ChipId, InputProblem, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "lib/utils/rotatePinOffset"
import {
  alignUnconnectedTestPoints,
  type PlacementPair,
  type UnconnectedTestPointAlignment,
} from "./alignUnconnectedTestPoints"

export type { UnconnectedTestPointAlignment } from "./alignUnconnectedTestPoints"

type TestPointMember = {
  testPointChipId: ChipId
  testPointPinId: PinId
  anchorChipId: ChipId
  anchorPinId: PinId
  side: Side
}

export type TestPointSideGroup = {
  anchorChipId: ChipId
  side: Side
  members: TestPointMember[]
  tangentOffset?: number
}

const MINIMUM_SEARCH_STEP = 0.2
const MAXIMUM_TANGENT_SEARCH_STEPS = 40
const MAXIMUM_OUTWARD_SHIFT_ATTEMPTS = 100

const SIDE_VECTORS: Record<Side, { x: number; y: number }> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

type Axis = "x" | "y"

const vectorToSide = (vector: { x: number; y: number }): Side => {
  if (Math.abs(vector.x) > Math.abs(vector.y)) {
    if (vector.x < 0) return "x-"
    return "x+"
  }
  if (vector.y < 0) return "y-"
  return "y+"
}

const rotateSide = (side: Side, ccwRotationDegrees: number): Side =>
  vectorToSide(rotatePinOffset(SIDE_VECTORS[side], ccwRotationDegrees))

const getOppositeSide = (side: Side): Side => {
  const vector = SIDE_VECTORS[side]
  return vectorToSide({ x: -vector.x, y: -vector.y })
}

const getPlacementBounds = ({
  placement,
  size,
  margin = 0,
}: {
  placement: Placement
  size: Point
  margin?: number
}) => {
  const rotatedSize = getRotatedSize(size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: rotatedSize.x + margin * 2,
    height: rotatedSize.y + margin * 2,
  })
}

const getPinOwnerMap = (inputProblem: InputProblem): Map<PinId, ChipId> => {
  const pinOwnerMap = new Map<PinId, ChipId>()
  for (const chip of Object.values(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinOwnerMap.set(pinId, chip.chipId)
  }
  return pinOwnerMap
}

const getStronglyConnectedPin = ({
  inputProblem,
  pinId,
}: {
  inputProblem: InputProblem
  pinId: PinId
}): PinId | null => {
  for (const otherPinId of Object.keys(inputProblem.chipPinMap)) {
    if (otherPinId === pinId) continue
    if (
      inputProblem.pinStrongConnMap[`${pinId}-${otherPinId}`] ||
      inputProblem.pinStrongConnMap[`${otherPinId}-${pinId}`]
    ) {
      return otherPinId
    }
  }
  return null
}

const getAnchorPinTangentPosition = ({
  inputProblem,
  inputLayout,
  anchorChipId,
  anchorPinId,
  side,
}: {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  anchorChipId: ChipId
  anchorPinId: PinId
  side: Side
}): number => {
  const anchorPlacement = inputLayout.chipPlacements[anchorChipId]!
  const anchorPin = inputProblem.chipPinMap[anchorPinId]!
  const rotatedOffset = rotatePinOffset(
    anchorPin.offset,
    anchorPlacement.ccwRotationDegrees,
  )
  if (side.startsWith("x")) {
    return anchorPlacement.y + rotatedOffset.y
  }
  return anchorPlacement.x + rotatedOffset.x
}

const createSideGroups = ({
  inputProblem,
  inputLayout,
}: {
  inputProblem: InputProblem
  inputLayout: OutputLayout
}): TestPointSideGroup[] => {
  const pinOwnerMap = getPinOwnerMap(inputProblem)
  const groups: TestPointSideGroup[] = []

  for (const testPoint of Object.values(inputProblem.chipMap)) {
    if (
      !testPoint.isTestPoint ||
      testPoint.fixedPosition ||
      testPoint.pins.length !== 1
    ) {
      continue
    }

    const testPointPinId = testPoint.pins[0]!
    const anchorPinId = getStronglyConnectedPin({
      inputProblem,
      pinId: testPointPinId,
    })
    if (!anchorPinId) continue

    const anchorChipId = pinOwnerMap.get(anchorPinId)
    if (!anchorChipId || anchorChipId === testPoint.chipId) continue
    if (inputProblem.chipMap[anchorChipId]?.isTestPoint) continue

    const anchorPlacement = inputLayout.chipPlacements[anchorChipId]
    const anchorPin = inputProblem.chipPinMap[anchorPinId]
    if (!anchorPlacement || !anchorPin) continue

    const side = rotateSide(anchorPin.side, anchorPlacement.ccwRotationDegrees)
    let group = groups.find(
      (candidate) =>
        candidate.anchorChipId === anchorChipId && candidate.side === side,
    )
    if (!group) {
      group = { anchorChipId, side, members: [] }
      groups.push(group)
    }
    group.members.push({
      testPointChipId: testPoint.chipId,
      testPointPinId,
      anchorChipId,
      anchorPinId,
      side,
    })
  }

  // Preserve the anchor-pin order instead of relying on input insertion order.
  for (const group of groups) {
    group.members.sort(
      (a, b) =>
        getAnchorPinTangentPosition({
          inputProblem,
          inputLayout,
          anchorChipId: group.anchorChipId,
          anchorPinId: a.anchorPinId,
          side: group.side,
        }) -
        getAnchorPinTangentPosition({
          inputProblem,
          inputLayout,
          anchorChipId: group.anchorChipId,
          anchorPinId: b.anchorPinId,
          side: group.side,
        }),
    )
  }
  return groups
}

const getTestPointRotation = ({
  inputProblem,
  member,
}: {
  inputProblem: InputProblem
  member: TestPointMember
}): number => {
  const chip = inputProblem.chipMap[member.testPointChipId]!
  const pin = inputProblem.chipPinMap[member.testPointPinId]!
  const allowedRotations = chip.availableRotations ?? [0, 90, 180, 270]
  const desiredPinSide = getOppositeSide(member.side)
  return (
    allowedRotations.find(
      (rotation) => rotateSide(pin.side, rotation) === desiredPinSide,
    ) ?? allowedRotations[0]!
  )
}

const placementsOverlap = ({
  inputProblem,
  chipIdA,
  placementA,
  chipIdB,
  placementB,
}: PlacementPair & { inputProblem: InputProblem }): boolean => {
  const boundsA = getPlacementBounds({
    placement: placementA,
    size: inputProblem.chipMap[chipIdA]!.size,
    margin: inputProblem.chipGap,
  })
  const boundsB = getPlacementBounds({
    placement: placementB,
    size: inputProblem.chipMap[chipIdB]!.size,
  })
  return boundsAreaOverlap(boundsA, boundsB) > 0
}

const getAbsolutePinPosition = ({
  inputProblem,
  pinId,
  placement,
}: {
  inputProblem: InputProblem
  pinId: PinId
  placement: Placement
}): Point => {
  const pin = inputProblem.chipPinMap[pinId]!
  const rotatedOffset = rotatePinOffset(
    pin.offset,
    placement.ccwRotationDegrees,
  )
  return {
    x: placement.x + rotatedOffset.x,
    y: placement.y + rotatedOffset.y,
  }
}

const countConnectionBodyCrossings = ({
  inputProblem,
  group,
  chipPlacements,
}: {
  inputProblem: InputProblem
  group: TestPointSideGroup
  chipPlacements: Record<ChipId, Placement>
}): number => {
  const groupChipIds = new Set(
    group.members.map((member) => member.testPointChipId),
  )
  let crossingCount = 0

  for (const member of group.members) {
    const testPointPlacement = chipPlacements[member.testPointChipId]!
    const anchorPlacement = chipPlacements[member.anchorChipId]!
    const segmentStart = getAbsolutePinPosition({
      inputProblem,
      pinId: member.testPointPinId,
      placement: testPointPlacement,
    })
    const segmentEnd = getAbsolutePinPosition({
      inputProblem,
      pinId: member.anchorPinId,
      placement: anchorPlacement,
    })

    for (const [otherChipId, otherPlacement] of Object.entries(
      chipPlacements,
    )) {
      if (
        otherChipId === member.anchorChipId ||
        groupChipIds.has(otherChipId)
      ) {
        continue
      }

      const bounds = getPlacementBounds({
        placement: otherPlacement,
        size: inputProblem.chipMap[otherChipId]!.size,
      })
      if (doesSegmentIntersectRect(segmentStart, segmentEnd, bounds)) {
        crossingCount++
      }
    }
  }

  return crossingCount
}

const groupHasBodyCollision = ({
  inputProblem,
  group,
  chipPlacements,
}: {
  inputProblem: InputProblem
  group: TestPointSideGroup
  chipPlacements: Record<ChipId, Placement>
}): boolean => {
  const groupChipIds = new Set(
    group.members.map((member) => member.testPointChipId),
  )
  return group.members.some((member) => {
    const testPointPlacement = chipPlacements[member.testPointChipId]!
    return Object.entries(chipPlacements).some(
      ([otherChipId, otherPlacement]) =>
        otherChipId !== group.anchorChipId &&
        !groupChipIds.has(otherChipId) &&
        placementsOverlap({
          inputProblem,
          chipIdA: member.testPointChipId,
          placementA: testPointPlacement,
          chipIdB: otherChipId,
          placementB: otherPlacement,
        }),
    )
  })
}

export class AlignTestPointsSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  outputLayout: OutputLayout | null = null
  testPointSideGroups: TestPointSideGroup[] = []
  unconnectedTestPointAlignment: UnconnectedTestPointAlignment | null = null

  constructor(params: {
    inputProblem: InputProblem
    inputLayout: OutputLayout
  }) {
    super()
    this.inputProblem = params.inputProblem
    this.inputLayout = params.inputLayout
  }

  private moveGroupAlongTangent({
    group,
    tangentAxis,
    chipPlacements,
  }: {
    group: TestPointSideGroup
    tangentAxis: Axis
    chipPlacements: Record<ChipId, Placement>
  }): void {
    const originalPlacements = new Map(
      group.members.map((member) => [
        member.testPointChipId,
        { ...chipPlacements[member.testPointChipId]! },
      ]),
    )
    const step = Math.max(
      this.inputProblem.partitionGap / 2,
      this.inputProblem.chipGap,
      MINIMUM_SEARCH_STEP,
    )
    const offsets = [0]
    for (
      let stepIndex = 1;
      stepIndex <= MAXIMUM_TANGENT_SEARCH_STEPS;
      stepIndex++
    ) {
      offsets.push(-stepIndex * step, stepIndex * step)
    }

    let bestOffset = 0
    let bestCrossingCount = Infinity
    for (const offset of offsets) {
      for (const member of group.members) {
        const originalPlacement = originalPlacements.get(
          member.testPointChipId,
        )!
        chipPlacements[member.testPointChipId] = {
          ...originalPlacement,
          [tangentAxis]: originalPlacement[tangentAxis] + offset,
        }
      }

      if (
        groupHasBodyCollision({
          inputProblem: this.inputProblem,
          group,
          chipPlacements,
        })
      ) {
        continue
      }

      const crossingCount = countConnectionBodyCrossings({
        inputProblem: this.inputProblem,
        group,
        chipPlacements,
      })
      if (crossingCount < bestCrossingCount) {
        bestCrossingCount = crossingCount
        bestOffset = offset
      }
      if (crossingCount === 0) break
    }

    for (const member of group.members) {
      const originalPlacement = originalPlacements.get(member.testPointChipId)!
      chipPlacements[member.testPointChipId] = {
        ...originalPlacement,
        [tangentAxis]: originalPlacement[tangentAxis] + bestOffset,
      }
    }
    group.tangentOffset = bestOffset
  }

  private placeGroup(
    group: TestPointSideGroup,
    chipPlacements: Record<ChipId, Placement>,
  ): void {
    const anchorPlacement = chipPlacements[group.anchorChipId]!
    const anchorChip = this.inputProblem.chipMap[group.anchorChipId]!
    const anchorBounds = getPlacementBounds({
      placement: anchorPlacement,
      size: anchorChip.size,
    })
    const normalAxis = group.side[0] as Axis
    let tangentAxis: Axis = "x"
    if (normalAxis === "x") tangentAxis = "y"
    const direction = SIDE_VECTORS[group.side][normalAxis] as -1 | 1
    const members = group.members
      .map((member) => {
        const anchorPin = this.inputProblem.chipPinMap[member.anchorPinId]!
        const rotatedAnchorPinOffset = rotatePinOffset(
          anchorPin.offset,
          anchorPlacement.ccwRotationDegrees,
        )
        const anchorPinPosition = {
          x: anchorPlacement.x + rotatedAnchorPinOffset.x,
          y: anchorPlacement.y + rotatedAnchorPinOffset.y,
        }
        const rotation = getTestPointRotation({
          inputProblem: this.inputProblem,
          member,
        })
        const size = getRotatedSize(
          this.inputProblem.chipMap[member.testPointChipId]!.size,
          rotation,
        )
        return { member, anchorPinPosition, rotation, size }
      })
      .sort(
        (a, b) =>
          a.anchorPinPosition[tangentAxis] - b.anchorPinPosition[tangentAxis],
      )

    let previousTangentEnd = -Infinity
    for (const entry of members) {
      const tangentExtent = entry.size[tangentAxis]
      const desiredTangent = entry.anchorPinPosition[tangentAxis]
      const tangentCenter = Math.max(
        desiredTangent,
        previousTangentEnd + this.inputProblem.chipGap + tangentExtent / 2,
      )
      previousTangentEnd = tangentCenter + tangentExtent / 2

      const pinNormal = entry.anchorPinPosition[normalAxis]
      let anchorEdge = anchorBounds.minX
      if (normalAxis === "y") anchorEdge = anchorBounds.minY
      if (normalAxis === "x" && direction > 0) anchorEdge = anchorBounds.maxX
      if (normalAxis === "y" && direction > 0) anchorEdge = anchorBounds.maxY
      let outwardBoundary = Math.min(anchorEdge, pinNormal)
      if (direction > 0) {
        outwardBoundary = Math.max(anchorEdge, pinNormal)
      }
      const normalCenter =
        outwardBoundary +
        direction * (this.inputProblem.chipGap + entry.size[normalAxis] / 2)

      let x = normalCenter
      let y = tangentCenter
      if (normalAxis === "y") {
        x = tangentCenter
        y = normalCenter
      }
      const placement: Placement = {
        x,
        y,
        ccwRotationDegrees: entry.rotation,
      }
      chipPlacements[entry.member.testPointChipId] = placement
    }

    const groupChipIds = new Set(
      members.map((entry) => entry.member.testPointChipId),
    )
    const shiftStep = Math.max(this.inputProblem.chipGap, MINIMUM_SEARCH_STEP)
    for (let attempt = 0; attempt < MAXIMUM_OUTWARD_SHIFT_ATTEMPTS; attempt++) {
      const collision = members.some((entry) => {
        const testPointChipId = entry.member.testPointChipId
        const testPointPlacement = chipPlacements[testPointChipId]!
        return Object.entries(chipPlacements).some(
          ([otherChipId, otherPlacement]) =>
            otherChipId !== group.anchorChipId &&
            !groupChipIds.has(otherChipId) &&
            placementsOverlap({
              inputProblem: this.inputProblem,
              chipIdA: testPointChipId,
              placementA: testPointPlacement,
              chipIdB: otherChipId,
              placementB: otherPlacement,
            }),
        )
      })
      if (!collision) break

      for (const testPointChipId of groupChipIds) {
        chipPlacements[testPointChipId]![normalAxis] += direction * shiftStep
      }
    }

    // Shift the complete ordered group together so connections stay uncrossed.
    this.moveGroupAlongTangent({ group, tangentAxis, chipPlacements })
  }

  private alignUnconnectedTestPoints(
    connectedTestPointIds: Set<ChipId>,
    chipPlacements: Record<ChipId, Placement>,
  ): void {
    const chipIds = Object.values(this.inputProblem.chipMap)
      .filter(
        (chip) =>
          chip.isTestPoint &&
          !chip.fixedPosition &&
          chip.pins.length === 1 &&
          chipPlacements[chip.chipId] &&
          !connectedTestPointIds.has(chip.chipId),
      )
      .map((chip) => chip.chipId)

    const result = alignUnconnectedTestPoints({
      inputProblem: this.inputProblem,
      chipIds,
      chipPlacements,
      placementsOverlap: (placementPair) =>
        placementsOverlap({
          inputProblem: this.inputProblem,
          ...placementPair,
        }),
    })
    this.unconnectedTestPointAlignment = result?.alignment ?? null
    if (result) Object.assign(chipPlacements, result.placements)
  }

  override _step() {
    const chipPlacements = structuredClone(this.inputLayout.chipPlacements)
    this.testPointSideGroups = createSideGroups({
      inputProblem: this.inputProblem,
      inputLayout: this.inputLayout,
    })

    for (const group of this.testPointSideGroups) {
      this.placeGroup(group, chipPlacements)
    }
    const connectedTestPointIds = new Set(
      this.testPointSideGroups.flatMap((group) =>
        group.members.map((member) => member.testPointChipId),
      ),
    )
    this.alignUnconnectedTestPoints(connectedTestPointIds, chipPlacements)

    this.outputLayout = {
      chipPlacements,
      groupPlacements: { ...this.inputLayout.groupPlacements },
    }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.inputProblem,
      this.outputLayout ?? this.inputLayout,
    )
  }
}
