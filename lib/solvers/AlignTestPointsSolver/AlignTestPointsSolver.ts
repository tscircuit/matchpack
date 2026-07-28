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

type PlacementPair = {
  chipIdA: ChipId
  placementA: Placement
  chipIdB: ChipId
  placementB: Placement
}

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

export type LooseTestPointGroup = {
  orientation: "horizontal" | "vertical"
  chipIds: ChipId[]
  perpendicularOffset: number
}

const MINIMUM_SEARCH_STEP = 0.2
const MAXIMUM_TANGENT_SEARCH_STEPS = 40
const MAXIMUM_OUTWARD_SHIFT_ATTEMPTS = 100
const MAXIMUM_NEARBY_PIN_GAP_IN_PIN_PITCHES = 1.5
const PIN_POSITION_EPSILON = 1e-6
const SEARCH_BOUNDARY_PADDING_STEPS = 2

const SIDE_VECTORS: Record<Side, { x: number; y: number }> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

type Axis = "x" | "y"

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
  const tangentAxis = SIDE_AXES[side].tangentAxis
  return anchorPlacement[tangentAxis] + rotatedOffset[tangentAxis]
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
  return groups.flatMap((group) => {
    if (group.members.length < 2) return [group]

    const anchorChip = inputProblem.chipMap[group.anchorChipId]!
    const anchorPlacement = inputLayout.chipPlacements[group.anchorChipId]!
    const sidePinPositions = anchorChip.pins
      .filter((pinId) => {
        const pin = inputProblem.chipPinMap[pinId]
        return (
          pin &&
          rotateSide(pin.side, anchorPlacement.ccwRotationDegrees) ===
            group.side
        )
      })
      .map((pinId) =>
        getAnchorPinTangentPosition({
          inputProblem,
          inputLayout,
          anchorChipId: group.anchorChipId,
          anchorPinId: pinId,
          side: group.side,
        }),
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
      const position = getAnchorPinTangentPosition({
        inputProblem,
        inputLayout,
        anchorChipId: member.anchorChipId,
        anchorPinId: member.anchorPinId,
        side: member.side,
      })
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
  })
}

const getTestPointCcwRotationDegrees = ({
  inputProblem,
  member,
}: {
  inputProblem: InputProblem
  member: TestPointMember
}): number => {
  const chip = inputProblem.chipMap[member.testPointChipId]!
  const pin = inputProblem.chipPinMap[member.testPointPinId]!
  const allowedRotations = chip.availableRotations ?? [0, 90, 180, 270]
  const desiredPinSide = OPPOSITE_SIDE[member.side]
  return (
    allowedRotations.find(
      (ccwRotationDegrees) =>
        rotateSide(pin.side, ccwRotationDegrees) === desiredPinSide,
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

type TestPointPlacementContext = {
  inputProblem: InputProblem
  chipPlacements: Record<ChipId, Placement>
}

const moveGroupAlongTangent = (
  {
    group,
    tangentAxis,
  }: {
    group: TestPointSideGroup
    tangentAxis: Axis
  },
  context: TestPointPlacementContext,
): void => {
  const { inputProblem, chipPlacements } = context
  const originalPlacements = new Map(
    group.members.map((member) => [
      member.testPointChipId,
      { ...chipPlacements[member.testPointChipId]! },
    ]),
  )
  const step = Math.max(
    inputProblem.partitionGap / 2,
    inputProblem.chipGap,
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
      const originalPlacement = originalPlacements.get(member.testPointChipId)!
      chipPlacements[member.testPointChipId] = {
        ...originalPlacement,
        [tangentAxis]: originalPlacement[tangentAxis] + offset,
      }
    }

    if (
      groupHasBodyCollision({
        inputProblem,
        group,
        chipPlacements,
      })
    ) {
      continue
    }

    const crossingCount = countConnectionBodyCrossings({
      inputProblem,
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
      const ccwRotationDegrees = getTestPointCcwRotationDegrees({
        inputProblem,
        member,
      })
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
  for (const entry of members) {
    const tangentExtent = entry.size[tangentAxis]
    const desiredTangent = entry.anchorPinPosition[tangentAxis]
    const tangentCenter = Math.max(
      desiredTangent,
      previousTangentEnd + inputProblem.chipGap + tangentExtent / 2,
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
      direction * (inputProblem.chipGap + entry.size[normalAxis] / 2)

    let x = normalCenter
    let y = tangentCenter
    if (normalAxis === "y") {
      x = tangentCenter
      y = normalCenter
    }
    const placement: Placement = {
      x,
      y,
      ccwRotationDegrees: entry.ccwRotationDegrees,
    }
    chipPlacements[entry.member.testPointChipId] = placement
  }

  const groupChipIds = new Set(
    members.map((entry) => entry.member.testPointChipId),
  )
  const shiftStep = Math.max(inputProblem.chipGap, MINIMUM_SEARCH_STEP)
  for (let attempt = 0; attempt < MAXIMUM_OUTWARD_SHIFT_ATTEMPTS; attempt++) {
    const collision = members.some((entry) => {
      const testPointChipId = entry.member.testPointChipId
      const testPointPlacement = chipPlacements[testPointChipId]!
      return Object.entries(chipPlacements).some(
        ([otherChipId, otherPlacement]) =>
          otherChipId !== group.anchorChipId &&
          !groupChipIds.has(otherChipId) &&
          placementsOverlap({
            inputProblem,
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
  moveGroupAlongTangent({ group, tangentAxis }, context)
}

const getChipPlacementSpan = (
  {
    chipIds,
    axis,
  }: {
    chipIds: ChipId[]
    axis: Axis
  },
  context: TestPointPlacementContext,
): number => {
  const positions = chipIds.map(
    (chipId) => context.chipPlacements[chipId]![axis],
  )
  return Math.max(...positions) - Math.min(...positions)
}

const placeLooseTestPoints = (
  { connectedTestPointIds }: { connectedTestPointIds: Set<ChipId> },
  context: TestPointPlacementContext,
): LooseTestPointGroup | null => {
  const { inputProblem, chipPlacements } = context
  const chipIds = Object.values(inputProblem.chipMap)
    .filter(
      (chip) =>
        chip.isTestPoint &&
        !chip.fixedPosition &&
        chip.pins.length === 1 &&
        chipPlacements[chip.chipId] &&
        !connectedTestPointIds.has(chip.chipId),
    )
    .map((chip) => chip.chipId)

  if (chipIds.length < 2) return null

  let orientation: LooseTestPointGroup["orientation"] = "vertical"
  let alignmentAxis: Axis = "y"
  let perpendicularAxis: Axis = "x"
  const horizontalSpan = getChipPlacementSpan({ chipIds, axis: "x" }, context)
  const verticalSpan = getChipPlacementSpan({ chipIds, axis: "y" }, context)
  if (horizontalSpan >= verticalSpan) {
    orientation = "horizontal"
    alignmentAxis = "x"
    perpendicularAxis = "y"
  }
  const entries = chipIds
    .map((chipId) => ({
      chipId,
      original: chipPlacements[chipId]!,
      size: getRotatedSize(
        inputProblem.chipMap[chipId]!.size,
        chipPlacements[chipId]!.ccwRotationDegrees,
      ),
    }))
    .sort(
      (a, b) =>
        a.original[alignmentAxis] - b.original[alignmentAxis] ||
        a.chipId.localeCompare(b.chipId),
    )

  const perpendicularCenter =
    entries.reduce((sum, entry) => sum + entry.original[perpendicularAxis], 0) /
    entries.length
  let previousEnd = -Infinity
  const placements: Record<ChipId, Placement> = {}
  for (const entry of entries) {
    const extent = entry.size[alignmentAxis]
    const center = Math.max(
      entry.original[alignmentAxis],
      previousEnd + inputProblem.chipGap + extent / 2,
    )
    placements[entry.chipId] = {
      ...entry.original,
      [alignmentAxis]: center,
      [perpendicularAxis]: perpendicularCenter,
    }
    previousEnd = center + extent / 2
  }

  const groupIds = new Set(chipIds)
  const step = Math.max(
    inputProblem.partitionGap / 2,
    inputProblem.chipGap,
    MINIMUM_SEARCH_STEP,
  )
  const otherEntries = Object.entries(chipPlacements).filter(
    ([chipId]) => !groupIds.has(chipId),
  )
  const maximumOffset =
    otherEntries.reduce(
      (maximum, [chipId, placement]) =>
        Math.max(
          maximum,
          Math.abs(placement[perpendicularAxis] - perpendicularCenter) +
            getRotatedSize(
              inputProblem.chipMap[chipId]!.size,
              placement.ccwRotationDegrees,
            )[perpendicularAxis],
        ),
      0,
    ) + inputProblem.partitionGap

  let perpendicularOffset = 0
  const maximumSteps =
    Math.ceil(maximumOffset / step) + SEARCH_BOUNDARY_PADDING_STEPS
  for (let stepIndex = 0; stepIndex <= maximumSteps; stepIndex++) {
    let offsets = [0]
    if (stepIndex > 0) {
      offsets = [-stepIndex * step, stepIndex * step]
    }
    const candidate = offsets.find((offset) =>
      entries.every((entry) => {
        const placement = {
          ...placements[entry.chipId]!,
          [perpendicularAxis]:
            placements[entry.chipId]![perpendicularAxis] + offset,
        }
        return otherEntries.every(
          ([otherChipId, otherPlacement]) =>
            !placementsOverlap({
              inputProblem,
              chipIdA: entry.chipId,
              placementA: placement,
              chipIdB: otherChipId,
              placementB: otherPlacement,
            }),
        )
      }),
    )
    if (candidate !== undefined) {
      perpendicularOffset = candidate
      break
    }
  }

  for (const entry of entries) {
    placements[entry.chipId]![perpendicularAxis] += perpendicularOffset
  }
  Object.assign(chipPlacements, placements)
  return {
    orientation,
    chipIds: entries.map((entry) => entry.chipId),
    perpendicularOffset,
  }
}

export class AlignTestPointsSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  outputLayout: OutputLayout | null = null
  testPointSideGroups: TestPointSideGroup[] = []
  looseTestPointGroup: LooseTestPointGroup | null = null

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
    this.testPointSideGroups = createSideGroups({
      inputProblem: this.inputProblem,
      inputLayout: this.inputLayout,
    })

    for (const group of this.testPointSideGroups) {
      placeTestPointSideGroup(
        { group },
        { inputProblem: this.inputProblem, chipPlacements },
      )
    }
    const connectedTestPointIds = new Set(
      this.testPointSideGroups.flatMap((group) =>
        group.members.map((member) => member.testPointChipId),
      ),
    )
    this.looseTestPointGroup = placeLooseTestPoints(
      { connectedTestPointIds },
      { inputProblem: this.inputProblem, chipPlacements },
    )

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
