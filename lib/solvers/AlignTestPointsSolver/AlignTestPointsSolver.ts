import {
  boundsAreaOverlap,
  doesSegmentIntersectRect,
  getBoundFromCenteredRect,
  type Point,
} from "@tscircuit/math-utils"
import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { getPinIdToStronglyConnectedPinsObj } from "lib/solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
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
const MINIMUM_COLLISION_SEARCH_STEP = 0.2
const PIN_POSITION_EPSILON = 1e-6
const TANGENT_SEARCH_BOUNDARY_PADDING_STEPS = 2
const TANGENT_SEARCH_PARTITION_GAP_FRACTION = 0.5

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

const placementsOverlap = ({
  inputProblem,
  chipIdA,
  placementA,
  chipIdB,
  placementB,
}: {
  inputProblem: InputProblem
  chipIdA: ChipId
  placementA: Placement
  chipIdB: ChipId
  placementB: Placement
}): boolean => {
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

const getPinOwnerMap = (inputProblem: InputProblem): Map<PinId, ChipId> => {
  const pinOwnerMap = new Map<PinId, ChipId>()
  for (const chip of Object.values(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinOwnerMap.set(pinId, chip.chipId)
  }
  return pinOwnerMap
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
  const pinIdToStronglyConnectedPins = getPinIdToStronglyConnectedPinsObj(
    context.inputProblem,
  )
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
    const anchorPin = pinIdToStronglyConnectedPins[testPointPinId]?.[0]
    if (!anchorPin) continue
    const anchorPinId = anchorPin.pinId

    const anchorChipId = pinOwnerMap.get(anchorPinId)
    if (!anchorChipId || anchorChipId === testPoint.chipId) continue
    if (context.inputProblem.chipMap[anchorChipId]?.isTestPoint) continue

    const anchorPlacement = context.inputLayout.chipPlacements[anchorChipId]
    if (!anchorPlacement) continue

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

const testPointGroupOverlapsOtherChips = (
  { group }: { group: TestPointSideGroup },
  context: TestPointPlacementContext,
): boolean => {
  const groupChipIds = new Set(
    group.members.map((member) => member.testPointChipId),
  )
  return group.members.some((member) => {
    const testPointPlacement = context.chipPlacements[member.testPointChipId]!
    return Object.entries(context.chipPlacements).some(
      ([otherChipId, otherPlacement]) =>
        otherChipId !== group.anchorChipId &&
        !groupChipIds.has(otherChipId) &&
        placementsOverlap({
          inputProblem: context.inputProblem,
          chipIdA: member.testPointChipId,
          placementA: testPointPlacement,
          chipIdB: otherChipId,
          placementB: otherPlacement,
        }),
    )
  })
}

const moveTestPointGroupOutwardUntilClear = (
  { group }: { group: TestPointSideGroup },
  context: TestPointPlacementContext,
): void => {
  const { normalAxis, direction } = SIDE_AXES[group.side]
  const searchStep = Math.max(
    context.inputProblem.chipGap,
    MINIMUM_COLLISION_SEARCH_STEP,
  )
  while (testPointGroupOverlapsOtherChips({ group }, context)) {
    for (const member of group.members) {
      context.chipPlacements[member.testPointChipId]![normalAxis] +=
        direction * searchStep
    }
  }
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

const countConnectionBodyCrossings = (
  { group }: { group: TestPointSideGroup },
  context: TestPointPlacementContext,
): number => {
  const groupChipIds = new Set(
    group.members.map((member) => member.testPointChipId),
  )
  let crossingCount = 0
  for (const member of group.members) {
    const segmentStart = getAbsolutePinPosition({
      inputProblem: context.inputProblem,
      pinId: member.testPointPinId,
      placement: context.chipPlacements[member.testPointChipId]!,
    })
    const segmentEnd = getAbsolutePinPosition({
      inputProblem: context.inputProblem,
      pinId: member.anchorPinId,
      placement: context.chipPlacements[member.anchorChipId]!,
    })

    for (const [otherChipId, otherPlacement] of Object.entries(
      context.chipPlacements,
    )) {
      if (
        otherChipId === member.anchorChipId ||
        groupChipIds.has(otherChipId)
      ) {
        continue
      }
      const otherBounds = getPlacementBounds({
        placement: otherPlacement,
        size: context.inputProblem.chipMap[otherChipId]!.size,
      })
      if (doesSegmentIntersectRect(segmentStart, segmentEnd, otherBounds)) {
        crossingCount++
      }
    }
  }
  return crossingCount
}

const getMaximumTangentSearchSteps = (
  {
    group,
    tangentAxis,
    searchStep,
  }: {
    group: TestPointSideGroup
    tangentAxis: Axis
    searchStep: number
  },
  context: TestPointPlacementContext,
): number => {
  const groupChipIds = new Set(
    group.members.map((member) => member.testPointChipId),
  )
  const groupCenter =
    group.members.reduce(
      (sum, member) =>
        sum + context.chipPlacements[member.testPointChipId]![tangentAxis],
      0,
    ) / group.members.length
  const maximumGroupExtent = Math.max(
    ...group.members.map((member) => {
      const placement = context.chipPlacements[member.testPointChipId]!
      return getRotatedSize(
        context.inputProblem.chipMap[member.testPointChipId]!.size,
        placement.ccwRotationDegrees,
      )[tangentAxis]
    }),
  )
  const maximumSearchDistance =
    Object.entries(context.chipPlacements).reduce(
      (maximumDistance, [chipId, placement]) => {
        if (groupChipIds.has(chipId)) return maximumDistance
        const chipExtent = getRotatedSize(
          context.inputProblem.chipMap[chipId]!.size,
          placement.ccwRotationDegrees,
        )[tangentAxis]
        return Math.max(
          maximumDistance,
          Math.abs(placement[tangentAxis] - groupCenter) +
            chipExtent +
            maximumGroupExtent,
        )
      },
      0,
    ) + context.inputProblem.partitionGap
  return (
    Math.ceil(maximumSearchDistance / searchStep) +
    TANGENT_SEARCH_BOUNDARY_PADDING_STEPS
  )
}

const moveTestPointGroupAlongTangent = (
  { group }: { group: TestPointSideGroup },
  context: TestPointPlacementContext,
): void => {
  const { tangentAxis } = SIDE_AXES[group.side]
  const originalPlacements = new Map(
    group.members.map((member) => [
      member.testPointChipId,
      { ...context.chipPlacements[member.testPointChipId]! },
    ]),
  )
  const searchStep = Math.max(
    context.inputProblem.partitionGap * TANGENT_SEARCH_PARTITION_GAP_FRACTION,
    context.inputProblem.chipGap,
    MINIMUM_COLLISION_SEARCH_STEP,
  )
  const maximumSearchSteps = getMaximumTangentSearchSteps(
    { group, tangentAxis, searchStep },
    context,
  )
  let bestOffset = 0
  let bestCrossingCount = Number.POSITIVE_INFINITY

  for (let stepIndex = 0; stepIndex <= maximumSearchSteps; stepIndex++) {
    const offsets = [0]
    if (stepIndex > 0) {
      offsets.length = 0
      offsets.push(-stepIndex * searchStep, stepIndex * searchStep)
    }
    for (const offset of offsets) {
      for (const member of group.members) {
        const originalPlacement = originalPlacements.get(
          member.testPointChipId,
        )!
        context.chipPlacements[member.testPointChipId] = {
          ...originalPlacement,
          [tangentAxis]: originalPlacement[tangentAxis] + offset,
        }
      }
      if (testPointGroupOverlapsOtherChips({ group }, context)) continue

      const crossingCount = countConnectionBodyCrossings({ group }, context)
      if (crossingCount < bestCrossingCount) {
        bestCrossingCount = crossingCount
        bestOffset = offset
      }
      if (crossingCount === 0) break
    }
    if (bestCrossingCount === 0) break
  }

  for (const member of group.members) {
    const originalPlacement = originalPlacements.get(member.testPointChipId)!
    context.chipPlacements[member.testPointChipId] = {
      ...originalPlacement,
      [tangentAxis]: originalPlacement[tangentAxis] + bestOffset,
    }
  }
}

const getTestPointPlacementSpan = (
  {
    testPointChipIds,
    axis,
  }: {
    testPointChipIds: ChipId[]
    axis: Axis
  },
  context: TestPointPlacementContext,
): number => {
  const positions = testPointChipIds.map(
    (chipId) => context.chipPlacements[chipId]![axis],
  )
  return Math.max(...positions) - Math.min(...positions)
}

const alignLooseTestPoints = (
  { anchoredTestPointChipIds }: { anchoredTestPointChipIds: Set<ChipId> },
  context: TestPointPlacementContext,
): void => {
  const looseTestPointChipIds = Object.values(context.inputProblem.chipMap)
    .filter(
      (chip) =>
        chip.isTestPoint &&
        !chip.fixedPosition &&
        chip.pins.length === 1 &&
        context.chipPlacements[chip.chipId] &&
        !anchoredTestPointChipIds.has(chip.chipId),
    )
    .map((chip) => chip.chipId)
  if (looseTestPointChipIds.length < 2) return

  let perpendicularAxis: Axis = "x"
  const horizontalSpan = getTestPointPlacementSpan(
    { testPointChipIds: looseTestPointChipIds, axis: "x" },
    context,
  )
  const verticalSpan = getTestPointPlacementSpan(
    { testPointChipIds: looseTestPointChipIds, axis: "y" },
    context,
  )
  if (horizontalSpan >= verticalSpan) {
    perpendicularAxis = "y"
  }

  const perpendicularCenter =
    looseTestPointChipIds.reduce(
      (sum, chipId) => sum + context.chipPlacements[chipId]![perpendicularAxis],
      0,
    ) / looseTestPointChipIds.length
  for (const chipId of looseTestPointChipIds) {
    context.chipPlacements[chipId]![perpendicularAxis] = perpendicularCenter
  }
}

export class AlignTestPointsSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  outputLayout: OutputLayout | null = null
  testPointSideGroups: TestPointSideGroup[] = []
  connectionBodyCrossingCount = 0

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
    for (const group of this.testPointSideGroups) {
      moveTestPointGroupOutwardUntilClear({ group }, placementContext)
      moveTestPointGroupAlongTangent({ group }, placementContext)
    }
    this.connectionBodyCrossingCount = this.testPointSideGroups.reduce(
      (crossingCount, group) =>
        crossingCount +
        countConnectionBodyCrossings({ group }, placementContext),
      0,
    )
    const anchoredTestPointChipIds = new Set(
      this.testPointSideGroups.flatMap((group) =>
        group.members.map((member) => member.testPointChipId),
      ),
    )
    alignLooseTestPoints({ anchoredTestPointChipIds }, placementContext)

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
