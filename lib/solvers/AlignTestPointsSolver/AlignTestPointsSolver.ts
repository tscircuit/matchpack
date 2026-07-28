import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { ChipId, InputProblem, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "lib/utils/rotatePinOffset"
import {
  alignUnconnectedTestPoints,
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

const SIDE_VECTORS: Record<Side, { x: number; y: number }> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

const vectorToSide = (vector: { x: number; y: number }): Side => {
  if (Math.abs(vector.x) > Math.abs(vector.y)) {
    return vector.x < 0 ? "x-" : "x+"
  }
  return vector.y < 0 ? "y-" : "y+"
}

const rotateSide = (side: Side, ccwRotationDegrees: number): Side =>
  vectorToSide(rotatePinOffset(SIDE_VECTORS[side], ccwRotationDegrees))

const oppositeSide = (side: Side): Side => {
  switch (side) {
    case "x-":
      return "x+"
    case "x+":
      return "x-"
    case "y-":
      return "y+"
    case "y+":
      return "y-"
  }
}

const getBounds = (placement: Placement, size: { x: number; y: number }) => {
  const rotatedSize = getRotatedSize(size, placement.ccwRotationDegrees)
  return {
    minX: placement.x - rotatedSize.x / 2,
    maxX: placement.x + rotatedSize.x / 2,
    minY: placement.y - rotatedSize.y / 2,
    maxY: placement.y + rotatedSize.y / 2,
  }
}

type Bounds = ReturnType<typeof getBounds>

const segmentIntersectsBounds = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: Bounds,
): boolean => {
  const direction = { x: end.x - start.x, y: end.y - start.y }
  let minT = 0
  let maxT = 1

  for (const [origin, delta, min, max] of [
    [start.x, direction.x, bounds.minX, bounds.maxX],
    [start.y, direction.y, bounds.minY, bounds.maxY],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false
      continue
    }

    const entryT = (min - origin) / delta
    const exitT = (max - origin) / delta
    minT = Math.max(minT, Math.min(entryT, exitT))
    maxT = Math.min(maxT, Math.max(entryT, exitT))
    if (minT > maxT) return false
  }

  return true
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

  private getPinOwnerMap(): Map<PinId, ChipId> {
    const pinOwnerMap = new Map<PinId, ChipId>()
    for (const chip of Object.values(this.inputProblem.chipMap)) {
      for (const pinId of chip.pins) pinOwnerMap.set(pinId, chip.chipId)
    }
    return pinOwnerMap
  }

  private getStronglyConnectedPin(pinId: PinId): PinId | null {
    for (const otherPinId of Object.keys(this.inputProblem.chipPinMap)) {
      if (otherPinId === pinId) continue
      if (
        this.inputProblem.pinStrongConnMap[`${pinId}-${otherPinId}`] ||
        this.inputProblem.pinStrongConnMap[`${otherPinId}-${pinId}`]
      ) {
        return otherPinId
      }
    }
    return null
  }

  private getAnchorPinTangentPosition(
    anchorChipId: ChipId,
    anchorPinId: PinId,
    side: Side,
  ): number {
    const anchorPlacement = this.inputLayout.chipPlacements[anchorChipId]!
    const anchorPin = this.inputProblem.chipPinMap[anchorPinId]!
    const rotatedOffset = rotatePinOffset(
      anchorPin.offset,
      anchorPlacement.ccwRotationDegrees,
    )
    return side.startsWith("x")
      ? anchorPlacement.y + rotatedOffset.y
      : anchorPlacement.x + rotatedOffset.x
  }

  private getAnchorSidePinPitch(group: TestPointSideGroup): number | null {
    const anchorChip = this.inputProblem.chipMap[group.anchorChipId]!
    const anchorPlacement = this.inputLayout.chipPlacements[group.anchorChipId]!
    const tangentPositions = anchorChip.pins
      .filter((pinId) => {
        const pin = this.inputProblem.chipPinMap[pinId]
        return (
          pin &&
          rotateSide(pin.side, anchorPlacement.ccwRotationDegrees) ===
            group.side
        )
      })
      .map((pinId) =>
        this.getAnchorPinTangentPosition(group.anchorChipId, pinId, group.side),
      )
      .sort((a, b) => a - b)

    const positiveGaps: number[] = []
    for (let index = 1; index < tangentPositions.length; index++) {
      const gap = tangentPositions[index]! - tangentPositions[index - 1]!
      if (gap > 1e-6) positiveGaps.push(gap)
    }
    return positiveGaps.length > 0 ? Math.min(...positiveGaps) : null
  }

  private splitGroupByPinProximity(
    group: TestPointSideGroup,
  ): TestPointSideGroup[] {
    if (group.members.length < 2) return [group]

    const pinPitch = this.getAnchorSidePinPitch(group)
    if (!pinPitch) return [group]

    const sortedMembers = [...group.members].sort(
      (a, b) =>
        this.getAnchorPinTangentPosition(
          group.anchorChipId,
          a.anchorPinId,
          group.side,
        ) -
        this.getAnchorPinTangentPosition(
          group.anchorChipId,
          b.anchorPinId,
          group.side,
        ),
    )
    const maxAdjacentPinGap = pinPitch * 1.5
    const splitGroups: TestPointSideGroup[] = []
    let currentMembers: TestPointMember[] = []
    let previousPosition: number | null = null

    for (const member of sortedMembers) {
      const position = this.getAnchorPinTangentPosition(
        group.anchorChipId,
        member.anchorPinId,
        group.side,
      )
      if (
        previousPosition !== null &&
        position - previousPosition > maxAdjacentPinGap + 1e-6
      ) {
        splitGroups.push({ ...group, members: currentMembers })
        currentMembers = []
      }
      currentMembers.push(member)
      previousPosition = position
    }
    if (currentMembers.length > 0) {
      splitGroups.push({ ...group, members: currentMembers })
    }

    return splitGroups
  }

  private createSideGroups(): TestPointSideGroup[] {
    const pinOwnerMap = this.getPinOwnerMap()
    const groups = new Map<string, TestPointSideGroup>()

    for (const testPoint of Object.values(this.inputProblem.chipMap)) {
      if (
        !testPoint.isTestPoint ||
        testPoint.fixedPosition ||
        testPoint.pins.length !== 1
      ) {
        continue
      }

      const testPointPinId = testPoint.pins[0]!
      const anchorPinId = this.getStronglyConnectedPin(testPointPinId)
      if (!anchorPinId) continue

      const anchorChipId = pinOwnerMap.get(anchorPinId)
      if (!anchorChipId || anchorChipId === testPoint.chipId) continue
      if (this.inputProblem.chipMap[anchorChipId]?.isTestPoint) continue

      const anchorPlacement = this.inputLayout.chipPlacements[anchorChipId]
      const anchorPin = this.inputProblem.chipPinMap[anchorPinId]
      if (!anchorPlacement || !anchorPin) continue

      const side = rotateSide(
        anchorPin.side,
        anchorPlacement.ccwRotationDegrees,
      )
      const groupKey = `${anchorChipId}:${side}`
      const group = groups.get(groupKey) ?? {
        anchorChipId,
        side,
        members: [],
      }
      group.members.push({
        testPointChipId: testPoint.chipId,
        testPointPinId,
        anchorChipId,
        anchorPinId,
        side,
      })
      groups.set(groupKey, group)
    }

    return [...groups.values()].flatMap((group) =>
      this.splitGroupByPinProximity(group),
    )
  }

  private getTestPointRotation(member: TestPointMember): number {
    const chip = this.inputProblem.chipMap[member.testPointChipId]!
    const pin = this.inputProblem.chipPinMap[member.testPointPinId]!
    const allowedRotations = chip.availableRotations ?? [0, 90, 180, 270]
    const desiredPinSide = oppositeSide(member.side)
    return (
      allowedRotations.find(
        (rotation) => rotateSide(pin.side, rotation) === desiredPinSide,
      ) ?? allowedRotations[0]!
    )
  }

  private placementsOverlap(
    chipIdA: ChipId,
    placementA: Placement,
    chipIdB: ChipId,
    placementB: Placement,
  ): boolean {
    const boundsA = getBounds(
      placementA,
      this.inputProblem.chipMap[chipIdA]!.size,
    )
    const boundsB = getBounds(
      placementB,
      this.inputProblem.chipMap[chipIdB]!.size,
    )
    const gap = this.inputProblem.chipGap
    return !(
      boundsA.maxX + gap <= boundsB.minX ||
      boundsA.minX - gap >= boundsB.maxX ||
      boundsA.maxY + gap <= boundsB.minY ||
      boundsA.minY - gap >= boundsB.maxY
    )
  }

  private getAbsolutePinPosition(
    chipId: ChipId,
    pinId: PinId,
    placement: Placement,
  ): { x: number; y: number } {
    const pin = this.inputProblem.chipPinMap[pinId]!
    const rotatedOffset = rotatePinOffset(
      pin.offset,
      placement.ccwRotationDegrees,
    )
    return {
      x: placement.x + rotatedOffset.x,
      y: placement.y + rotatedOffset.y,
    }
  }

  private countConnectionBodyCrossings(
    group: TestPointSideGroup,
    chipPlacements: Record<ChipId, Placement>,
  ): number {
    const groupChipIds = new Set(
      group.members.map((member) => member.testPointChipId),
    )
    let crossingCount = 0

    for (const member of group.members) {
      const testPointPlacement = chipPlacements[member.testPointChipId]!
      const anchorPlacement = chipPlacements[member.anchorChipId]!
      const segmentStart = this.getAbsolutePinPosition(
        member.testPointChipId,
        member.testPointPinId,
        testPointPlacement,
      )
      const segmentEnd = this.getAbsolutePinPosition(
        member.anchorChipId,
        member.anchorPinId,
        anchorPlacement,
      )

      for (const [otherChipId, otherPlacement] of Object.entries(
        chipPlacements,
      )) {
        if (
          otherChipId === member.anchorChipId ||
          groupChipIds.has(otherChipId)
        ) {
          continue
        }

        const bounds = getBounds(
          otherPlacement,
          this.inputProblem.chipMap[otherChipId]!.size,
        )
        if (segmentIntersectsBounds(segmentStart, segmentEnd, bounds)) {
          crossingCount++
        }
      }
    }

    return crossingCount
  }

  private groupHasBodyCollision(
    group: TestPointSideGroup,
    chipPlacements: Record<ChipId, Placement>,
  ): boolean {
    const groupChipIds = new Set(
      group.members.map((member) => member.testPointChipId),
    )
    return group.members.some((member) => {
      const testPointPlacement = chipPlacements[member.testPointChipId]!
      return Object.entries(chipPlacements).some(
        ([otherChipId, otherPlacement]) =>
          otherChipId !== group.anchorChipId &&
          !groupChipIds.has(otherChipId) &&
          this.placementsOverlap(
            member.testPointChipId,
            testPointPlacement,
            otherChipId,
            otherPlacement,
          ),
      )
    })
  }

  private moveGroupAlongTangent(
    group: TestPointSideGroup,
    tangentAxis: "x" | "y",
    chipPlacements: Record<ChipId, Placement>,
  ): void {
    const originalPlacements = new Map(
      group.members.map((member) => [
        member.testPointChipId,
        { ...chipPlacements[member.testPointChipId]! },
      ]),
    )
    const step = Math.max(
      this.inputProblem.partitionGap / 2,
      this.inputProblem.chipGap,
      0.2,
    )
    const offsets = [0]
    for (let stepIndex = 1; stepIndex <= 40; stepIndex++) {
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

      if (this.groupHasBodyCollision(group, chipPlacements)) continue

      const crossingCount = this.countConnectionBodyCrossings(
        group,
        chipPlacements,
      )
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
    const anchorBounds = getBounds(anchorPlacement, anchorChip.size)
    const normalAxis = group.side.startsWith("x") ? "x" : "y"
    const tangentAxis = normalAxis === "x" ? "y" : "x"
    const direction = group.side.endsWith("+") ? 1 : -1
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
        const rotation = this.getTestPointRotation(member)
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

      const anchorEdge =
        normalAxis === "x"
          ? direction > 0
            ? anchorBounds.maxX
            : anchorBounds.minX
          : direction > 0
            ? anchorBounds.maxY
            : anchorBounds.minY
      const pinNormal = entry.anchorPinPosition[normalAxis]
      const outwardBoundary =
        direction > 0
          ? Math.max(anchorEdge, pinNormal)
          : Math.min(anchorEdge, pinNormal)
      const normalCenter =
        outwardBoundary +
        direction * (this.inputProblem.chipGap + entry.size[normalAxis] / 2)

      chipPlacements[entry.member.testPointChipId] = {
        x: normalAxis === "x" ? normalCenter : tangentCenter,
        y: normalAxis === "y" ? normalCenter : tangentCenter,
        ccwRotationDegrees: entry.rotation,
      }
    }

    const groupChipIds = new Set(
      members.map((entry) => entry.member.testPointChipId),
    )
    const shiftStep = Math.max(this.inputProblem.chipGap, 0.2)
    for (let attempt = 0; attempt < 100; attempt++) {
      const collision = members.some((entry) => {
        const testPointChipId = entry.member.testPointChipId
        const testPointPlacement = chipPlacements[testPointChipId]!
        return Object.entries(chipPlacements).some(
          ([otherChipId, otherPlacement]) =>
            otherChipId !== group.anchorChipId &&
            !groupChipIds.has(otherChipId) &&
            this.placementsOverlap(
              testPointChipId,
              testPointPlacement,
              otherChipId,
              otherPlacement,
            ),
        )
      })
      if (!collision) break

      for (const testPointChipId of groupChipIds) {
        chipPlacements[testPointChipId]![normalAxis] += direction * shiftStep
      }
    }

    this.moveGroupAlongTangent(group, tangentAxis, chipPlacements)
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
      placementsOverlap: (chipIdA, placementA, chipIdB, placementB) =>
        this.placementsOverlap(chipIdA, placementA, chipIdB, placementB),
    })
    this.unconnectedTestPointAlignment = result?.alignment ?? null
    if (result) Object.assign(chipPlacements, result.placements)
  }

  override _step() {
    const chipPlacements = structuredClone(this.inputLayout.chipPlacements)
    this.testPointSideGroups = this.createSideGroups()

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
