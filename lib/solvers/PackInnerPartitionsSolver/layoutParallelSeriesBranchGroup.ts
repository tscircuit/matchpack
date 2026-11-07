import {
  type Bounds,
  boundsDistance,
  getBoundFromCenteredRect,
  getBoundsFromPoints,
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
  ParallelSeriesBranchGroup,
  SeriesBranchBridge,
  SeriesBranchComponent,
} from "./findParallelSeriesBranchGroups"

/** Default rotations for movable two-pin components without an explicit lock. */
const DEFAULT_ROTATIONS: NonNullable<Chip["availableRotations"]> = [
  0, 90, 180, 270,
]
const CLEARANCE_EPSILON = 1e-6

type LayoutAxes = {
  outward: Point
  tangent: Point
}

type BranchLayout = {
  placements: Record<ChipId, Placement>
  terminalOutwardCoordinate: number
}

const dot = (point: Point, axis: Point): number =>
  point.x * axis.x + point.y * axis.y

const pointFromCoordinates = ({
  outwardCoordinate,
  tangentCoordinate,
  axes,
}: {
  outwardCoordinate: number
  tangentCoordinate: number
  axes: LayoutAxes
}): Point => ({
  x: axes.outward.x * outwardCoordinate + axes.tangent.x * tangentCoordinate,
  y: axes.outward.y * outwardCoordinate + axes.tangent.y * tangentCoordinate,
})

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

const getHalfExtent = ({ size, axis }: { size: Point; axis: Point }): number =>
  (Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y) / 2

/**
 * Choose an allowed rotation that makes the component's signal direction
 * (near pin -> far pin) point away from the main chip.
 */
const getOutwardRotation = ({
  chip,
  nearPinId,
  farPinId,
  inputProblem,
  outward,
  originalRotation,
}: {
  chip: Chip
  nearPinId: PinId
  farPinId: PinId
  inputProblem: InputProblem
  outward: Point
  originalRotation: number
}): number => {
  const nearPin = inputProblem.chipPinMap[nearPinId]
  const farPin = inputProblem.chipPinMap[farPinId]
  if (!nearPin || !farPin) return originalRotation

  const rotations = chip.availableRotations ?? DEFAULT_ROTATIONS
  let bestRotation = rotations[0] ?? 0
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
      score > bestScore ||
      (score === bestScore && rotation === originalRotation)
    ) {
      bestScore = score
      bestRotation = rotation
    }
  }
  return bestRotation
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

const layoutBranch = ({
  branch,
  mainPinId,
  mainChip,
  mainPlacement,
  inputProblem,
  axes,
  originalPlacements,
  extraGap,
}: {
  branch: SeriesBranchComponent[]
  mainPinId: PinId
  mainChip: Chip
  mainPlacement: Placement
  inputProblem: InputProblem
  axes: LayoutAxes
  originalPlacements: Record<ChipId, Placement>
  extraGap: number
}): BranchLayout | null => {
  const mainPin = inputProblem.chipPinMap[mainPinId]
  if (!mainPin) return null

  const mainSize = getRotatedSize(
    mainChip.size,
    mainPlacement.ccwRotationDegrees,
  )
  const mainPinOffset = rotatePinOffset(
    mainPin.offset,
    mainPlacement.ccwRotationDegrees,
  )
  const mainPinPosition = {
    x: mainPlacement.x + mainPinOffset.x,
    y: mainPlacement.y + mainPinOffset.y,
  }
  let previousOuterBodyCoordinate =
    dot(mainPlacement, axes.outward) +
    getHalfExtent({ size: mainSize, axis: axes.outward })
  previousOuterBodyCoordinate = Math.max(
    previousOuterBodyCoordinate,
    dot(mainPinPosition, axes.outward),
  )
  let previousFarPinTangentCoordinate = dot(mainPinPosition, axes.tangent)

  const placements: Record<ChipId, Placement> = {}
  let terminalOutwardCoordinate = previousOuterBodyCoordinate
  for (const branchComponent of branch) {
    const chip = inputProblem.chipMap[branchComponent.chipId]
    const originalPlacement = originalPlacements[branchComponent.chipId]
    const nearPin = inputProblem.chipPinMap[branchComponent.nearPinId]
    const farPin = inputProblem.chipPinMap[branchComponent.farPinId]
    if (!chip || !originalPlacement || !nearPin || !farPin) return null

    const rotation = getOutwardRotation({
      chip,
      nearPinId: branchComponent.nearPinId,
      farPinId: branchComponent.farPinId,
      inputProblem,
      outward: axes.outward,
      originalRotation: originalPlacement.ccwRotationDegrees,
    })
    const size = getRotatedSize(chip.size, rotation)
    const halfOutwardExtent = getHalfExtent({
      size,
      axis: axes.outward,
    })
    const nearPinOffset = rotatePinOffset(nearPin.offset, rotation)
    const farPinOffset = rotatePinOffset(farPin.offset, rotation)
    const outwardCoordinate =
      previousOuterBodyCoordinate +
      inputProblem.chipGap +
      extraGap +
      halfOutwardExtent
    const tangentCoordinate =
      previousFarPinTangentCoordinate - dot(nearPinOffset, axes.tangent)
    const center = pointFromCoordinates({
      outwardCoordinate,
      tangentCoordinate,
      axes,
    })
    placements[chip.chipId] = {
      ...center,
      ccwRotationDegrees: rotation,
    }

    previousOuterBodyCoordinate = outwardCoordinate + halfOutwardExtent
    previousFarPinTangentCoordinate =
      tangentCoordinate + dot(farPinOffset, axes.tangent)
    terminalOutwardCoordinate =
      outwardCoordinate + dot(farPinOffset, axes.outward)
  }

  return { placements, terminalOutwardCoordinate }
}

const translateBranchAlongTangent = ({
  branchLayout,
  shift,
  tangent,
}: {
  branchLayout: BranchLayout
  shift: number
  tangent: Point
}): void => {
  for (const placement of Object.values(branchLayout.placements)) {
    placement.x += tangent.x * shift
    placement.y += tangent.y * shift
  }
}

const getBranchTangentBounds = ({
  branchLayout,
  inputProblem,
  tangent,
}: {
  branchLayout: BranchLayout
  inputProblem: InputProblem
  tangent: Point
}): { min: number; max: number } => {
  const bounds = getBoundsFromPoints(
    Object.entries(branchLayout.placements).flatMap(([chipId, placement]) => {
      const chipBounds = getBounds({
        chip: inputProblem.chipMap[chipId]!,
        placement,
      })
      return [
        { x: chipBounds.minX, y: chipBounds.minY },
        { x: chipBounds.maxX, y: chipBounds.maxY },
      ]
    }),
  )
  if (!bounds) return { min: 0, max: 0 }
  if (Math.abs(tangent.x) >= Math.abs(tangent.y)) {
    return { min: bounds.minX, max: bounds.maxX }
  }
  return { min: bounds.minY, max: bounds.maxY }
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

    for (
      let otherIndex = index + 1;
      otherIndex < candidateEntries.length;
      otherIndex++
    ) {
      const [otherChipId, otherPlacement] = candidateEntries[otherIndex]!
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

const getBridgeRotation = ({
  bridgeChip,
  bridge,
  inputProblem,
  railAxis,
  lateralAxis,
  originalRotation,
}: {
  bridgeChip: Chip
  bridge: SeriesBranchBridge
  inputProblem: InputProblem
  railAxis: Point
  lateralAxis: Point
  originalRotation: number
}): number | null => {
  const supplyPin = inputProblem.chipPinMap[bridge.supplyPinId]
  if (!supplyPin) return null

  const rotations = bridgeChip.availableRotations ?? DEFAULT_ROTATIONS
  let bestRotation: number | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const rotation of rotations) {
    const supplyOffset = rotatePinOffset(supplyPin.offset, rotation)
    const railAlignment = dot(supplyOffset, railAxis)
    if (railAlignment <= CLEARANCE_EPSILON) continue
    const score = railAlignment - Math.abs(dot(supplyOffset, lateralAxis))
    if (
      score > bestScore ||
      (score === bestScore && rotation === originalRotation)
    ) {
      bestScore = score
      bestRotation = rotation
    }
  }
  return bestRotation
}

const layoutBridgedParallelSeriesBranchGroup = ({
  group,
  bridge,
  mainChip,
  mainPlacement,
  pinSideAxes,
  chipPlacements,
  inputProblem,
}: {
  group: ParallelSeriesBranchGroup
  bridge: SeriesBranchBridge
  mainChip: Chip
  mainPlacement: Placement
  pinSideAxes: LayoutAxes
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): Record<ChipId, Placement> | null => {
  const bridgeChip = inputProblem.chipMap[bridge.chipId]
  const originalBridgePlacement = chipPlacements[bridge.chipId]
  if (!bridgeChip || !originalBridgePlacement) return null

  const connectsToGround = Object.entries(inputProblem.netMap).some(
    ([netId, net]) =>
      net.isGround === true &&
      (Boolean(inputProblem.netConnMap[`${bridge.supplyPinId}-${netId}`]) ||
        Boolean(
          inputProblem.pinStrongConnMap[`${bridge.supplyPinId}-${netId}`],
        ) ||
        Boolean(
          inputProblem.pinStrongConnMap[`${netId}-${bridge.supplyPinId}`],
        )),
  )
  const railAxis: Point = getUnitVectorFromDirection(
    connectsToGround ? "down" : "up",
  )
  const isHorizontalSide =
    Math.abs(pinSideAxes.outward.x) >= Math.abs(pinSideAxes.outward.y)
  const lateralAxis: Point = isHorizontalSide
    ? pinSideAxes.outward
    : getUnitVectorFromDirection("right")

  const bridgeRotation = getBridgeRotation({
    bridgeChip,
    bridge,
    inputProblem,
    railAxis,
    lateralAxis,
    originalRotation: originalBridgePlacement.ccwRotationDegrees,
  })
  if (bridgeRotation === null) return null

  const getMainPinPosition = (pinId: PinId): Point => {
    const pin = inputProblem.chipPinMap[pinId]!
    const offset = rotatePinOffset(pin.offset, mainPlacement.ccwRotationDegrees)
    return {
      x: mainPlacement.x + offset.x,
      y: mainPlacement.y + offset.y,
    }
  }

  // Order the two columns so the main-chip pin further along railAxis sits
  // closer to the main chip along lateralAxis, avoiding lead crossings.
  const branchEntries = group.branches
    .map((branch, index) => ({
      branch,
      mainPinId: group.mainPinIds[index]!,
    }))
    .sort((first, second) => {
      const firstPos = getMainPinPosition(first.mainPinId)
      const secondPos = getMainPinPosition(second.mainPinId)
      if (isHorizontalSide) {
        return dot(secondPos, railAxis) - dot(firstPos, railAxis)
      }
      return dot(firstPos, lateralAxis) - dot(secondPos, lateralAxis)
    })

  const mainSize = getRotatedSize(
    mainChip.size,
    mainPlacement.ccwRotationDegrees,
  )
  const mainOuterLateral = Math.max(
    dot(mainPlacement, lateralAxis) +
      getHalfExtent({ size: mainSize, axis: lateralAxis }),
    ...branchEntries.map(({ mainPinId }) =>
      dot(getMainPinPosition(mainPinId), lateralAxis),
    ),
  )
  const maxMainPinRail = Math.max(
    ...branchEntries.map(({ mainPinId }) =>
      dot(getMainPinPosition(mainPinId), railAxis),
    ),
  )

  const columnComponentSpecs = branchEntries.map(({ branch }) =>
    branch.map((component) => {
      const chip = inputProblem.chipMap[component.chipId]
      const originalPlacement = chipPlacements[component.chipId]
      const nearPin = inputProblem.chipPinMap[component.nearPinId]
      const farPin = inputProblem.chipPinMap[component.farPinId]
      if (!chip || !originalPlacement || !nearPin || !farPin) return null

      const rotation = getOutwardRotation({
        chip,
        nearPinId: component.nearPinId,
        farPinId: component.farPinId,
        inputProblem,
        outward: railAxis,
        originalRotation: originalPlacement.ccwRotationDegrees,
      })
      const size = getRotatedSize(chip.size, rotation)
      const nearOffset = rotatePinOffset(nearPin.offset, rotation)
      const farOffset = rotatePinOffset(farPin.offset, rotation)
      const halfLateral = getHalfExtent({ size, axis: lateralAxis })
      const halfRail = getHalfExtent({ size, axis: railAxis })
      return {
        chipId: chip.chipId,
        rotation,
        halfLateral,
        nearExtent: Math.max(halfRail, -dot(nearOffset, railAxis)),
        farExtent: Math.max(halfRail, dot(farOffset, railAxis)),
      }
    }),
  )
  if (
    columnComponentSpecs.some((column) => column.some((spec) => spec === null))
  ) {
    return null
  }

  const columnHalfWidths = columnComponentSpecs.map((column) =>
    Math.max(...column.map((spec) => spec!.halfLateral)),
  )
  const bridgeSize = getRotatedSize(bridgeChip.size, bridgeRotation)
  const bridgeHalfRail = getHalfExtent({ size: bridgeSize, axis: railAxis })

  const bridgedAxes: LayoutAxes = {
    outward: lateralAxis,
    tangent: railAxis,
  }

  const offsetSteps = [0, 1, 2]
  for (const lateralStep of offsetSteps) {
    for (const railStep of offsetSteps) {
      const firstLateral =
        mainOuterLateral +
        inputProblem.chipGap * (1 + lateralStep) +
        columnHalfWidths[0]!
      const secondLateral =
        firstLateral +
        columnHalfWidths[0]! +
        inputProblem.chipGap +
        columnHalfWidths[1]!
      const columnLaterals = [firstLateral, secondLateral]

      const candidatePlacements: Record<ChipId, Placement> = {}
      let maxBranchEndRail = Number.NEGATIVE_INFINITY

      for (
        let columnIndex = 0;
        columnIndex < columnComponentSpecs.length;
        columnIndex++
      ) {
        const column = columnComponentSpecs[columnIndex]!
        const lateralCoordinate = columnLaterals[columnIndex]!
        let currentStartRail =
          maxMainPinRail + inputProblem.chipGap * (1 + railStep)

        for (const spec of column) {
          const railCoordinate = currentStartRail + spec!.nearExtent
          const center = pointFromCoordinates({
            outwardCoordinate: lateralCoordinate,
            tangentCoordinate: railCoordinate,
            axes: bridgedAxes,
          })
          candidatePlacements[spec!.chipId] = {
            ...center,
            ccwRotationDegrees: spec!.rotation,
          }
          const componentEndRail = railCoordinate + spec!.farExtent
          maxBranchEndRail = Math.max(maxBranchEndRail, componentEndRail)
          currentStartRail = componentEndRail + inputProblem.chipGap
        }
      }

      const bridgeCenter = pointFromCoordinates({
        outwardCoordinate: (firstLateral + secondLateral) / 2,
        tangentCoordinate:
          maxBranchEndRail + inputProblem.chipGap + bridgeHalfRail,
        axes: bridgedAxes,
      })
      candidatePlacements[bridgeChip.chipId] = {
        ...bridgeCenter,
        ccwRotationDegrees: bridgeRotation,
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
  }

  return null
}

/**
 * Reflow a topology-detected U-shaped path into two parallel columns. Returns
 * null when the candidate cannot preserve the requested component clearance.
 */
export const layoutParallelSeriesBranchGroup = ({
  group,
  chipPlacements,
  inputProblem,
}: {
  group: ParallelSeriesBranchGroup
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): Record<ChipId, Placement> | null => {
  const mainChip = inputProblem.chipMap[group.mainChipId]
  const mainPlacement = chipPlacements[group.mainChipId]
  const firstMainPin = inputProblem.chipPinMap[group.mainPinIds[0]]
  if (!mainChip || !mainPlacement || !firstMainPin) return null

  const rotatedMainPinOffset = rotatePinOffset(
    firstMainPin.offset,
    mainPlacement.ccwRotationDegrees,
  )
  const axes = getLayoutAxes({ pinOffset: rotatedMainPinOffset })
  if (group.bridge) {
    return layoutBridgedParallelSeriesBranchGroup({
      group,
      bridge: group.bridge,
      mainChip,
      mainPlacement,
      pinSideAxes: axes,
      chipPlacements,
      inputProblem,
    })
  }
  const branchEntries = group.branches
    .map((branch, index) => ({
      branch,
      mainPinId: group.mainPinIds[index]!,
    }))
    .sort((first, second) => {
      const getMainPinTangentCoordinate = (pinId: PinId) => {
        const pin = inputProblem.chipPinMap[pinId]!
        const offset = rotatePinOffset(
          pin.offset,
          mainPlacement.ccwRotationDegrees,
        )
        return dot(
          {
            x: mainPlacement.x + offset.x,
            y: mainPlacement.y + offset.y,
          },
          axes.tangent,
        )
      }
      return (
        getMainPinTangentCoordinate(first.mainPinId) -
        getMainPinTangentCoordinate(second.mainPinId)
      )
    })

  let branchLayouts = branchEntries.map(({ branch, mainPinId }) =>
    layoutBranch({
      branch,
      mainPinId,
      mainChip,
      mainPlacement,
      inputProblem,
      axes,
      originalPlacements: chipPlacements,
      extraGap: 0,
    }),
  )
  if (branchLayouts.some((layout) => !layout)) return null

  // Keep the shared outer connection perpendicular to the columns. A shorter
  // branch receives evenly distributed extra spacing instead of moving away
  // from its main-chip anchor as one rigid block.
  const terminalOutwardCoordinate = Math.max(
    ...branchLayouts.map((layout) => layout!.terminalOutwardCoordinate),
  )
  branchLayouts = branchEntries.map(({ branch, mainPinId }, index) => {
    const branchLayout = branchLayouts[index]!
    const extraGap =
      (terminalOutwardCoordinate - branchLayout.terminalOutwardCoordinate) /
      branch.length
    return layoutBranch({
      branch,
      mainPinId,
      mainChip,
      mainPlacement,
      inputProblem,
      axes,
      originalPlacements: chipPlacements,
      extraGap,
    })
  })
  if (branchLayouts.some((layout) => !layout)) return null

  // Separate the columns symmetrically when their main-chip pins are closer
  // together than the component bodies permit.
  const firstBounds = getBranchTangentBounds({
    branchLayout: branchLayouts[0]!,
    inputProblem,
    tangent: axes.tangent,
  })
  const secondBounds = getBranchTangentBounds({
    branchLayout: branchLayouts[1]!,
    inputProblem,
    tangent: axes.tangent,
  })
  const separationDeficit = Math.max(
    0,
    firstBounds.max + inputProblem.chipGap - secondBounds.min,
  )
  translateBranchAlongTangent({
    branchLayout: branchLayouts[0]!,
    shift: -separationDeficit / 2,
    tangent: axes.tangent,
  })
  translateBranchAlongTangent({
    branchLayout: branchLayouts[1]!,
    shift: separationDeficit / 2,
    tangent: axes.tangent,
  })

  const candidatePlacements = Object.assign(
    {},
    branchLayouts[0]!.placements,
    branchLayouts[1]!.placements,
  )
  if (
    !candidateHasClearance({
      candidatePlacements,
      originalPlacements: chipPlacements,
      inputProblem,
    })
  ) {
    return null
  }
  return candidatePlacements
}
