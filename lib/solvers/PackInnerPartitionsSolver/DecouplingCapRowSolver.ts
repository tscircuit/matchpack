/**
 * Inner-partition layout solver for a `decoupling_caps` partition — the caps-only
 * partition ChipPartitionsSolver builds for each group found by
 * IdentifyDecouplingCapsSolver.
 *
 * Those two solvers only *identify* and *isolate* the group; until now nothing
 * consumed the partition type, so the group's arrangement fell through to
 * calculate-packing (which the partition type only reached to ask for a tighter
 * minGap). calculate-packing places each component at the outline point that
 * minimizes the distance between same-network pads, which lines identical parts up
 * along the *shorter side of their body*, making the arrangement a function of body
 * geometry.
 *
 * It isn't. Every cap in the group bridges the same power and ground net, so the
 * two rails are straight only when the caps sit shoulder to shoulder *across their
 * pin axis*. A vertical cap's symbol is wider than it is tall (0.9 x 0.6 — wide
 * plates, short leads), so packing along the body's short side stacks the group into
 * a column. The older, larger cap symbol happened to be portrait (1.08 x 1.10),
 * which made the body-derived axis coincide with the pin-derived one; @tscircuit/core's
 * smaller symbol broke the coincidence. (Value labels widen the body further, but
 * the symbol is landscape without them, so they are not the trigger.)
 *
 * There is no packing problem here: N caps on one line. So the axis comes from the
 * pins and the row is placed directly. Caps keep their fixed rotation and their
 * chipMap order (which follows the main chip's pin order), are pitched by chip.size
 * so value labels keep their room, and are aligned so every positive pin lands on
 * one rail.
 *
 * Sibling to SingleInnerPartitionPackingSolver and ParallelAlignedPassiveSolver;
 * PackInnerPartitionsSolver dispatches to it by partition type.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  Chip,
  ChipId,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"

/** Axis a 2-pin chip's pins run along, once its fixed rotation is applied. */
const getPinAxis = (
  chip: Chip,
  problem: PartitionInputProblem,
): "x" | "y" | null => {
  if (chip.pins.length !== 2) return null

  const [pinA, pinB] = chip.pins.map((pinId) => problem.chipPinMap[pinId])
  if (!pinA || !pinB) return null

  const rotation = chip.availableRotations?.[0] ?? 0
  const offsetA = rotatePinOffset(pinA.offset, rotation)
  const offsetB = rotatePinOffset(pinB.offset, rotation)

  if (Math.abs(offsetA.y - offsetB.y) >= Math.abs(offsetA.x - offsetB.x)) {
    return "y"
  }
  return "x"
}

/**
 * A decoupling cap partition this solver can lay out as a rail row: at least two
 * free 2-pin caps that agree on a pin axis, so the row has one direction.
 */
export const canLayoutDecouplingCapRow = (
  partition: PartitionInputProblem,
): boolean => {
  if (partition.partitionType !== "decoupling_caps") return false

  const chips = Object.values(partition.chipMap)
  if (chips.length < 2) return false

  let sharedPinAxis: "x" | "y" | null = null
  for (const chip of chips) {
    if (chip.fixedPosition) return false

    const pinAxis = getPinAxis(chip, partition)
    if (!pinAxis) return false
    if (sharedPinAxis && sharedPinAxis !== pinAxis) return false
    sharedPinAxis = pinAxis
  }

  return sharedPinAxis !== null
}

export class DecouplingCapRowSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  packConnectionPinIds: PinId[] = []

  constructor(params: { partitionInputProblem: PartitionInputProblem }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
  }

  private getRotation(chip: Chip): number {
    return chip.availableRotations?.[0] ?? 0
  }

  private isOnPositiveVoltageNet(pinId: PinId): boolean {
    const problem = this.partitionInputProblem
    for (const [connKey, connected] of Object.entries(problem.netConnMap)) {
      if (!connected) continue
      if (!connKey.startsWith(`${pinId}-`)) continue
      const netId = connKey.slice(pinId.length + 1)
      if (problem.netMap[netId]?.isPositiveVoltageSource) return true
    }
    return false
  }

  /**
   * Offset along the pin axis that puts this cap's positive pin on the shared rail.
   * Falls back to centering the body if no pin sits on a positive net.
   */
  private getRailOffset(chip: Chip, pinAxis: "x" | "y"): number {
    const positivePinId = chip.pins.find((pinId) =>
      this.isOnPositiveVoltageNet(pinId),
    )
    if (!positivePinId) return 0

    const pin = this.partitionInputProblem.chipPinMap[positivePinId]
    if (!pin) return 0

    return -rotatePinOffset(pin.offset, this.getRotation(chip))[pinAxis]
  }

  override _step() {
    const problem = this.partitionInputProblem
    const chips = Object.values(problem.chipMap)

    // canLayoutDecouplingCapRow guarantees every chip agrees on this axis.
    const pinAxis = getPinAxis(chips[0]!, problem)!
    // Caps line up across their pin axis, so the two rails run straight.
    let rowAxis: "x" | "y" = "y"
    if (pinAxis === "y") rowAxis = "x"

    const gap = problem.decouplingCapsGap ?? problem.chipGap

    const extents = chips.map(
      (chip) => getRotatedSize(chip.size, this.getRotation(chip))[rowAxis],
    )
    const rowLength =
      extents.reduce((sum, extent) => sum + extent, 0) +
      gap * (chips.length - 1)

    const chipPlacements: Record<ChipId, Placement> = {}
    let cursor = -rowLength / 2
    const mainChipSide = problem.decouplingMainChipSide
    const lastChipIsNearestMainChip =
      (rowAxis === "x" && mainChipSide === "x-") ||
      (rowAxis === "y" && mainChipSide === "y-")
    let nearestMainChip = chips[0]!
    if (lastChipIsNearestMainChip) {
      nearestMainChip = chips[chips.length - 1]!
    }
    this.packConnectionPinIds = [...nearestMainChip.pins]

    chips.forEach((chip, index) => {
      const extent = extents[index]!

      const placement: Placement = {
        x: 0,
        y: 0,
        ccwRotationDegrees: this.getRotation(chip),
      }
      placement[rowAxis] = cursor + extent / 2
      placement[pinAxis] = this.getRailOffset(chip, pinAxis)
      chipPlacements[chip.chipId] = placement

      cursor += extent + gap
    })

    this.layout = { chipPlacements, groupPlacements: {} }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.partitionInputProblem,
      this.layout ?? { chipPlacements: {}, groupPlacements: {} },
    )
  }

  override getConstructorParams(): [
    { partitionInputProblem: PartitionInputProblem },
  ] {
    return [{ partitionInputProblem: this.partitionInputProblem }]
  }
}
