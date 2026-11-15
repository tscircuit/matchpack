import type {
  Chip,
  ChipId,
  PartitionInputProblem,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { getDecouplingRailNetId } from "../../utils/getDecouplingRailNetId"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"

const getRotation = (chip: Chip) => chip.availableRotations?.[0] ?? 0
const ANCHOR_TOLERANCE = 1e-8

const getPinAxis = (
  chip: Chip,
  problem: PartitionInputProblem,
): "x" | "y" | null => {
  if (chip.pins.length !== 2) return null
  const [pinA, pinB] = chip.pins.map((pinId) => problem.chipPinMap[pinId])
  if (!pinA || !pinB) return null
  const a = rotatePinOffset(pinA.offset, getRotation(chip))
  const b = rotatePinOffset(pinB.offset, getRotation(chip))
  return Math.abs(a.y - b.y) >= Math.abs(a.x - b.x) ? "y" : "x"
}

/**
 * Plan one ordered rail row. Fixed caps must agree on one translation of that
 * row; incompatible anchors leave the partition to the general packing solver.
 * Both dispatch and execution use this plan so feasibility cannot diverge.
 */
export const getDecouplingCapRowLayout = (
  problem: PartitionInputProblem,
): OutputLayout | null => {
  if (problem.partitionType !== "decoupling_caps") return null
  const chips = Object.values(problem.chipMap)
  if (chips.length < 2) return null
  const pinAxis = getPinAxis(chips[0]!, problem)
  if (!pinAxis || chips.some((chip) => getPinAxis(chip, problem) !== pinAxis)) {
    return null
  }
  const rowAxis = pinAxis === "y" ? "x" : "y"
  const railNetId = getDecouplingRailNetId({
    inputProblem: problem,
    netIds: Object.keys(problem.netMap),
  })
  const gap = problem.decouplingCapsGap ?? problem.chipGap
  const extents = chips.map(
    (chip) => getRotatedSize(chip.size, getRotation(chip))[rowAxis],
  )
  const length =
    extents.reduce((sum, extent) => sum + extent, 0) + gap * (chips.length - 1)
  const reverse =
    (rowAxis === "x" && problem.decouplingMainChipSide === "x-") ||
    (rowAxis === "y" && problem.decouplingMainChipSide === "y-")
  const direction = reverse ? -1 : 1
  let cursor = reverse ? length / 2 : -length / 2
  const chipPlacements: Record<ChipId, Placement> = {}

  chips.forEach((chip, index) => {
    const extent = extents[index]!
    const rotation = getRotation(chip)
    const railPinId = chip.pins.find(
      (pinId) =>
        railNetId && problem.netConnMap[`${pinId}-${railNetId}`] === true,
    )
    const railPin = railPinId && problem.chipPinMap[railPinId]
    const placement: Placement = { x: 0, y: 0, ccwRotationDegrees: rotation }
    placement[rowAxis] = cursor + (direction * extent) / 2
    placement[pinAxis] = railPin
      ? -rotatePinOffset(railPin.offset, rotation)[pinAxis]
      : 0
    chipPlacements[chip.chipId] = placement
    cursor += direction * (extent + gap)
  })

  let translation: { x: number; y: number } | null = null
  for (const chip of chips) {
    if (!chip.fixedPosition) continue
    const placement = chipPlacements[chip.chipId]!
    const offset = {
      x: chip.fixedPosition.x - placement.x,
      y: chip.fixedPosition.y - placement.y,
    }
    if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) return null
    if (
      translation &&
      (Math.abs(offset.x - translation.x) > ANCHOR_TOLERANCE ||
        Math.abs(offset.y - translation.y) > ANCHOR_TOLERANCE)
    ) {
      return null
    }
    translation ??= offset
  }
  if (translation) {
    for (const chip of chips) {
      const placement = chipPlacements[chip.chipId]!
      placement.x += translation.x
      placement.y += translation.y
      // Keep caller-provided anchor coordinates exact despite float arithmetic.
      if (chip.fixedPosition) Object.assign(placement, chip.fixedPosition)
    }
  }
  return { chipPlacements, groupPlacements: {} }
}
