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

const SIDE_VECTORS: Record<Side, { x: number; y: number }> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

type Axis = "x" | "y"

const SIDE_LAYOUT: Record<
  Side,
  {
    opposite: Side
    normalAxis: Axis
    tangentAxis: Axis
    direction: -1 | 1
    anchorEdge: "minX" | "maxX" | "minY" | "maxY"
  }
> = {
  "x-": {
    opposite: "x+",
    normalAxis: "x",
    tangentAxis: "y",
    direction: -1,
    anchorEdge: "minX",
  },
  "x+": {
    opposite: "x-",
    normalAxis: "x",
    tangentAxis: "y",
    direction: 1,
    anchorEdge: "maxX",
  },
  "y-": {
    opposite: "y+",
    normalAxis: "y",
    tangentAxis: "x",
    direction: -1,
    anchorEdge: "minY",
  },
  "y+": {
    opposite: "y-",
    normalAxis: "y",
    tangentAxis: "x",
    direction: 1,
    anchorEdge: "maxY",
  },
}

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

  private getAnchorPinTangentPosition({
    anchorChipId,
    anchorPinId,
    side,
  }: {
    anchorChipId: ChipId
    anchorPinId: PinId
    side: Side
  }): number {
    const anchorPlacement = this.inputLayout.chipPlacements[anchorChipId]!
    const anchorPin = this.inputProblem.chipPinMap[anchorPinId]!
    const rotatedOffset = rotatePinOffset(
      anchorPin.offset,
      anchorPlacement.ccwRotationDegrees,
    )
    if (side.startsWith("x")) {
      return anchorPlacement.y + rotatedOffset.y
    }
    return anchorPlacement.x + rotatedOffset.x
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

    return [...groups.values()].map((group) => ({
      ...group,
      members: [...group.members].sort(
        (a, b) =>
          this.getAnchorPinTangentPosition({
            anchorChipId: group.anchorChipId,
            anchorPinId: a.anchorPinId,
            side: group.side,
          }) -
          this.getAnchorPinTangentPosition({
            anchorChipId: group.anchorChipId,
            anchorPinId: b.anchorPinId,
            side: group.side,
          }),
      ),
    }))
  }

  private getTestPointRotation(member: TestPointMember): number {
    const chip = this.inputProblem.chipMap[member.testPointChipId]!
    const pin = this.inputProblem.chipPinMap[member.testPointPinId]!
    const allowedRotations = chip.availableRotations ?? [0, 90, 180, 270]
    const desiredPinSide = SIDE_LAYOUT[member.side].opposite
    return (
      allowedRotations.find(
        (rotation) => rotateSide(pin.side, rotation) === desiredPinSide,
      ) ?? allowedRotations[0]!
    )
  }

  private placementsOverlap({
    chipIdA,
    placementA,
    chipIdB,
    placementB,
  }: PlacementPair): boolean {
    const boundsA = getPlacementBounds({
      placement: placementA,
      size: this.inputProblem.chipMap[chipIdA]!.size,
      margin: this.inputProblem.chipGap,
    })
    const boundsB = getPlacementBounds({
      placement: placementB,
      size: this.inputProblem.chipMap[chipIdB]!.size,
    })
    return boundsAreaOverlap(boundsA, boundsB) > 0
  }

  private getAbsolutePinPosition({
    pinId,
    placement,
  }: {
    pinId: PinId
    placement: Placement
  }): Point {
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
      const segmentStart = this.getAbsolutePinPosition({
        pinId: member.testPointPinId,
        placement: testPointPlacement,
      })
      const segmentEnd = this.getAbsolutePinPosition({
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
          size: this.inputProblem.chipMap[otherChipId]!.size,
        })
        if (doesSegmentIntersectRect(segmentStart, segmentEnd, bounds)) {
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
          this.placementsOverlap({
            chipIdA: member.testPointChipId,
            placementA: testPointPlacement,
            chipIdB: otherChipId,
            placementB: otherPlacement,
          }),
      )
    })
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
    const anchorBounds = getPlacementBounds({
      placement: anchorPlacement,
      size: anchorChip.size,
    })
    const { normalAxis, tangentAxis, direction, anchorEdge } =
      SIDE_LAYOUT[group.side]
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

      const pinNormal = entry.anchorPinPosition[normalAxis]
      let outwardBoundary = Math.min(anchorBounds[anchorEdge], pinNormal)
      if (direction > 0) {
        outwardBoundary = Math.max(anchorBounds[anchorEdge], pinNormal)
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
    const shiftStep = Math.max(this.inputProblem.chipGap, 0.2)
    for (let attempt = 0; attempt < 100; attempt++) {
      const collision = members.some((entry) => {
        const testPointChipId = entry.member.testPointChipId
        const testPointPlacement = chipPlacements[testPointChipId]!
        return Object.entries(chipPlacements).some(
          ([otherChipId, otherPlacement]) =>
            otherChipId !== group.anchorChipId &&
            !groupChipIds.has(otherChipId) &&
            this.placementsOverlap({
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
        this.placementsOverlap(placementPair),
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
