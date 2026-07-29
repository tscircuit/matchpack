import type { GraphicsObject } from "graphics-debug"
import type {
  Chip,
  ChipId,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

type PairPins = {
  nearChip: Chip
  farChip: Chip
  chipSidePinId: PinId
  nearInternalPinId: PinId
  farInternalPinId: PinId
  groundPinId: PinId
}

const getPinOwner = (
  pinId: PinId,
  problem: PartitionInputProblem,
): Chip | null =>
  Object.values(problem.chipMap).find((chip) => chip.pins.includes(pinId)) ??
  null

const getStronglyConnectedPins = (
  pinId: PinId,
  problem: PartitionInputProblem,
): PinId[] => {
  const connectedPins = new Set<PinId>()
  for (const [connection, connected] of Object.entries(
    problem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [pinA, pinB] = connection.split("-") as [PinId, PinId]
    if (pinA === pinId) connectedPins.add(pinB)
    if (pinB === pinId) connectedPins.add(pinA)
  }
  return [...connectedPins]
}

const isGroundPin = (pinId: PinId, problem: PartitionInputProblem): boolean =>
  Object.entries(problem.netConnMap).some(([connection, connected]) => {
    if (!connected || !connection.startsWith(`${pinId}-`)) return false
    const netId = connection.slice(pinId.length + 1)
    return problem.netMap[netId]?.isGround === true
  })

const getPairPins = (problem: PartitionInputProblem): PairPins | null => {
  const chips = Object.values(problem.chipMap)
  if (chips.length !== 2 || chips.some((chip) => chip.pins.length !== 2)) {
    return null
  }

  const farChip = chips.find((chip) =>
    chip.pins.some((pinId) => isGroundPin(pinId, problem)),
  )
  if (!farChip) return null
  const nearChip = chips.find((chip) => chip.chipId !== farChip.chipId)!
  const groundPinId = farChip.pins.find((pinId) => isGroundPin(pinId, problem))!
  const farInternalPinId = farChip.pins.find((pinId) => pinId !== groundPinId)!
  const nearInternalPinId = getStronglyConnectedPins(
    farInternalPinId,
    problem,
  ).find((pinId) => getPinOwner(pinId, problem)?.chipId === nearChip.chipId)
  if (!nearInternalPinId) return null
  const chipSidePinId = nearChip.pins.find(
    (pinId) => pinId !== nearInternalPinId,
  )!

  return {
    nearChip,
    farChip,
    chipSidePinId,
    nearInternalPinId,
    farInternalPinId,
    groundPinId,
  }
}

const chooseVerticalRotation = ({
  chip,
  topPinId,
  bottomPinId,
  problem,
}: {
  chip: Chip
  topPinId: PinId
  bottomPinId: PinId
  problem: PartitionInputProblem
}): number => {
  const topPin = problem.chipPinMap[topPinId]!
  const bottomPin = problem.chipPinMap[bottomPinId]!
  const rotations = chip.availableRotations ?? [0, 90, 180, 270]

  return rotations.reduce((bestRotation, rotation) => {
    const bestDelta =
      rotatePinOffset(topPin.offset, bestRotation).y -
      rotatePinOffset(bottomPin.offset, bestRotation).y
    const candidateDelta =
      rotatePinOffset(topPin.offset, rotation).y -
      rotatePinOffset(bottomPin.offset, rotation).y
    return candidateDelta > bestDelta ? rotation : bestRotation
  })
}

export const canLayoutGroundedLoadPair = (
  partition: PartitionInputProblem,
): boolean =>
  partition.partitionType === "grounded_load_pair" &&
  getPairPins(partition) !== null

export class GroundedLoadPairSolver extends BaseSolver {
  layout: OutputLayout | null = null

  constructor(
    private params: { partitionInputProblem: PartitionInputProblem },
  ) {
    super()
  }

  override _step() {
    const problem = this.params.partitionInputProblem
    const pair = getPairPins(problem)
    if (!pair) {
      this.failed = true
      this.error = "Invalid grounded load pair partition"
      return
    }

    const nearRotation = chooseVerticalRotation({
      chip: pair.nearChip,
      topPinId: pair.chipSidePinId,
      bottomPinId: pair.nearInternalPinId,
      problem,
    })
    const farRotation = chooseVerticalRotation({
      chip: pair.farChip,
      topPinId: pair.farInternalPinId,
      bottomPinId: pair.groundPinId,
      problem,
    })
    const nearSize = getRotatedSize(pair.nearChip.size, nearRotation)
    const farSize = getRotatedSize(pair.farChip.size, farRotation)
    const centerDistance = nearSize.y / 2 + problem.chipGap + farSize.y / 2
    const nearInternalOffset = rotatePinOffset(
      problem.chipPinMap[pair.nearInternalPinId]!.offset,
      nearRotation,
    )
    const farInternalOffset = rotatePinOffset(
      problem.chipPinMap[pair.farInternalPinId]!.offset,
      farRotation,
    )

    const chipPlacements: Record<ChipId, Placement> = {
      [pair.nearChip.chipId]: {
        x: 0,
        y: centerDistance / 2,
        ccwRotationDegrees: nearRotation,
      },
      [pair.farChip.chipId]: {
        x: nearInternalOffset.x - farInternalOffset.x,
        y: -centerDistance / 2,
        ccwRotationDegrees: farRotation,
      },
    }
    this.layout = { chipPlacements, groupPlacements: {} }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.params.partitionInputProblem,
      this.layout ?? { chipPlacements: {}, groupPlacements: {} },
    )
  }

  override getConstructorParams(): [
    { partitionInputProblem: PartitionInputProblem },
  ] {
    return [this.params]
  }
}
