import { getBoundFromCenteredRect, type Point } from "@tscircuit/math-utils"
import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { ChipId, InputProblem, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "lib/utils/rotatePinOffset"

type Axis = "x" | "y"

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

type TestPointPlacementContext = {
  inputProblem: InputProblem
  chipPlacements: Record<ChipId, Placement>
}

const MAXIMUM_NEARBY_PIN_GAP_IN_PIN_PITCHES = 1.5
const PIN_POSITION_EPSILON = 1e-6

const SIDE_VECTORS: Record<Side, Point> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

const SIDE_AXES: Record<
  Side,
  { normalAxis: Axis; tangentAxis: Axis; direction: -1 | 1 }
> = {
  "x-": { normalAxis: "x", tangentAxis: "y", direction: -1 },
  "x+": { normalAxis: "x", tangentAxis: "y", direction: 1 },
  "y-": { normalAxis: "y", tangentAxis: "x", direction: -1 },
  "y+": { normalAxis: "y", tangentAxis: "x", direction: 1 },
}

const OPPOSITE_SIDE: Record<Side, Side> = {
  "x-": "x+",
  "x+": "x-",
  "y-": "y+",
  "y+": "y-",
}

const vectorToSide = (vector: Point): Side => {
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
}: {
  placement: Placement
  size: Point
}) => {
  const rotatedSize = getRotatedSize(size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: rotatedSize.x,
    height: rotatedSize.y,
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
    const forwardConnectionId = `${pinId}-${otherPinId}` as const
    const reverseConnectionId = `${otherPinId}-${pinId}` as const
    if (
      inputProblem.pinStrongConnMap[forwardConnectionId] ||
      inputProblem.pinStrongConnMap[reverseConnectionId]
    ) {
      return otherPinId
    }
  }
  return null
}

const getAnchorPinTangentPosition = (
  {
    anchorChipId,
    anchorPinId,
    side,
  }: {
    anchorChipId: ChipId
    anchorPinId: PinId
    side: Side
  },
  context: {
    inputProblem: InputProblem
    inputLayout: OutputLayout
  },
): number => {
  const anchorPlacement = context.inputLayout.chipPlacements[anchorChipId]!
  const anchorPin = context.inputProblem.chipPinMap[anchorPinId]!
  const rotatedOffset = rotatePinOffset(
    anchorPin.offset,
    anchorPlacement.ccwRotationDegrees,
  )
  const tangentAxis = SIDE_AXES[side].tangentAxis
  return anchorPlacement[tangentAxis] + rotatedOffset[tangentAxis]
}

const splitGroupByPinProximity = (
  { group }: { group: TestPointSideGroup },
  context: {
    inputProblem: InputProblem
    inputLayout: OutputLayout
  },
): TestPointSideGroup[] => {
  if (group.members.length < 2) return [group]

  const anchorChip = context.inputProblem.chipMap[group.anchorChipId]!
  const anchorPlacement =
    context.inputLayout.chipPlacements[group.anchorChipId]!
  const sidePinPositions = anchorChip.pins
    .filter((pinId) => {
      const pin = context.inputProblem.chipPinMap[pinId]
      return (
        pin &&
        rotateSide(pin.side, anchorPlacement.ccwRotationDegrees) === group.side
      )
    })
    .map((pinId) =>
      getAnchorPinTangentPosition(
        {
          anchorChipId: group.anchorChipId,
          anchorPinId: pinId,
          side: group.side,
        },
        context,
      ),
    )
    .sort((a, b) => a - b)

  const pinGaps = sidePinPositions
    .slice(1)
    .map((position, index) => position - sidePinPositions[index]!)
    .filter((gap) => gap > PIN_POSITION_EPSILON)
  if (pinGaps.length === 0) return [group]

  const maximumNearbyGap =
    Math.min(...pinGaps) * MAXIMUM_NEARBY_PIN_GAP_IN_PIN_PITCHES
  const splitGroups: TestPointSideGroup[] = []
  let members: TestPointMember[] = []
  let previousPosition: number | undefined

  for (const member of group.members) {
    const position = getAnchorPinTangentPosition(
      {
        anchorChipId: member.anchorChipId,
        anchorPinId: member.anchorPinId,
        side: member.side,
      },
      context,
    )
    if (
      previousPosition !== undefined &&
      position - previousPosition > maximumNearbyGap + PIN_POSITION_EPSILON
    ) {
      splitGroups.push({ ...group, members })
      members = []
    }
    members.push(member)
    previousPosition = position
  }
  if (members.length > 0) splitGroups.push({ ...group, members })
  return splitGroups
}

const createTestPointSideGroups = (context: {
  inputProblem: InputProblem
  inputLayout: OutputLayout
}): TestPointSideGroup[] => {
  const pinOwnerMap = getPinOwnerMap(context.inputProblem)
  const groups: TestPointSideGroup[] = []

  for (const testPoint of Object.values(context.inputProblem.chipMap)) {
    if (
      !testPoint.isTestPoint ||
      testPoint.fixedPosition ||
      testPoint.pins.length !== 1
    ) {
      continue
    }

    const testPointPinId = testPoint.pins[0]!
    const anchorPinId = getStronglyConnectedPin({
      inputProblem: context.inputProblem,
      pinId: testPointPinId,
    })
    if (!anchorPinId) continue

    const anchorChipId = pinOwnerMap.get(anchorPinId)
    if (!anchorChipId || anchorChipId === testPoint.chipId) continue
    if (context.inputProblem.chipMap[anchorChipId]?.isTestPoint) continue

    const anchorPlacement = context.inputLayout.chipPlacements[anchorChipId]
    const anchorPin = context.inputProblem.chipPinMap[anchorPinId]
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

  for (const group of groups) {
    group.members.sort(
      (a, b) =>
        getAnchorPinTangentPosition(
          {
            anchorChipId: a.anchorChipId,
            anchorPinId: a.anchorPinId,
            side: a.side,
          },
          context,
        ) -
        getAnchorPinTangentPosition(
          {
            anchorChipId: b.anchorChipId,
            anchorPinId: b.anchorPinId,
            side: b.side,
          },
          context,
        ),
    )
  }

  return groups.flatMap((group) => splitGroupByPinProximity({ group }, context))
}

const getTestPointCcwRotationDegrees = (
  { member }: { member: TestPointMember },
  context: TestPointPlacementContext,
): number => {
  const chip = context.inputProblem.chipMap[member.testPointChipId]!
  const pin = context.inputProblem.chipPinMap[member.testPointPinId]!
  const allowedRotations = chip.availableRotations ?? [0, 90, 180, 270]
  const desiredPinSide = OPPOSITE_SIDE[member.side]
  return (
    allowedRotations.find(
      (ccwRotationDegrees) =>
        rotateSide(pin.side, ccwRotationDegrees) === desiredPinSide,
    ) ?? allowedRotations[0]!
  )
}

const placeTestPointSideGroup = (
  { group }: { group: TestPointSideGroup },
  context: TestPointPlacementContext,
): void => {
  const { inputProblem, chipPlacements } = context
  const anchorPlacement = chipPlacements[group.anchorChipId]!
  const anchorChip = inputProblem.chipMap[group.anchorChipId]!
  const anchorBounds = getPlacementBounds({
    placement: anchorPlacement,
    size: anchorChip.size,
  })
  const { normalAxis, tangentAxis, direction } = SIDE_AXES[group.side]
  const members = group.members
    .map((member) => {
      const anchorPin = inputProblem.chipPinMap[member.anchorPinId]!
      const rotatedAnchorPinOffset = rotatePinOffset(
        anchorPin.offset,
        anchorPlacement.ccwRotationDegrees,
      )
      const anchorPinPosition = {
        x: anchorPlacement.x + rotatedAnchorPinOffset.x,
        y: anchorPlacement.y + rotatedAnchorPinOffset.y,
      }
      const ccwRotationDegrees = getTestPointCcwRotationDegrees(
        { member },
        context,
      )
      const size = getRotatedSize(
        inputProblem.chipMap[member.testPointChipId]!.size,
        ccwRotationDegrees,
      )
      return { member, anchorPinPosition, ccwRotationDegrees, size }
    })
    .sort(
      (a, b) =>
        a.anchorPinPosition[tangentAxis] - b.anchorPinPosition[tangentAxis],
    )

  let previousTangentEnd = -Infinity
  for (const memberPlacement of members) {
    const tangentExtent = memberPlacement.size[tangentAxis]
    const desiredTangent = memberPlacement.anchorPinPosition[tangentAxis]
    const tangentCenter = Math.max(
      desiredTangent,
      previousTangentEnd + inputProblem.chipGap + tangentExtent / 2,
    )
    previousTangentEnd = tangentCenter + tangentExtent / 2

    const pinNormal = memberPlacement.anchorPinPosition[normalAxis]
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
      direction * (inputProblem.chipGap + memberPlacement.size[normalAxis] / 2)

    let x = normalCenter
    let y = tangentCenter
    if (normalAxis === "y") {
      x = tangentCenter
      y = normalCenter
    }
    chipPlacements[memberPlacement.member.testPointChipId] = {
      x,
      y,
      ccwRotationDegrees: memberPlacement.ccwRotationDegrees,
    }
  }
}

export class AlignTestPointsSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  outputLayout: OutputLayout | null = null
  testPointSideGroups: TestPointSideGroup[] = []

  constructor(options: {
    inputProblem: InputProblem
    inputLayout: OutputLayout
  }) {
    super()
    this.inputProblem = options.inputProblem
    this.inputLayout = options.inputLayout
  }

  override _step() {
    const chipPlacements = structuredClone(this.inputLayout.chipPlacements)
    const placementContext = {
      inputProblem: this.inputProblem,
      chipPlacements,
    }
    this.testPointSideGroups = createTestPointSideGroups({
      inputProblem: this.inputProblem,
      inputLayout: this.inputLayout,
    })

    for (const group of this.testPointSideGroups) {
      placeTestPointSideGroup({ group }, placementContext)
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
