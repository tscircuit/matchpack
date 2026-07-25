import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { ChipId, InputProblem, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "lib/utils/rotatePinOffset"

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

export class AlignTestPointsSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  outputLayout: OutputLayout | null = null
  testPointSideGroups: TestPointSideGroup[] = []

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

    return [...groups.values()]
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
      if (!collision) return

      for (const testPointChipId of groupChipIds) {
        chipPlacements[testPointChipId]![normalAxis] += direction * shiftStep
      }
    }
  }

  override _step() {
    const chipPlacements = structuredClone(this.inputLayout.chipPlacements)
    this.testPointSideGroups = this.createSideGroups()

    for (const group of this.testPointSideGroups) {
      this.placeGroup(group, chipPlacements)
    }

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
