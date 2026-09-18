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
 * one rail. If exactly one cap is fixed, it anchors the row without being moved;
 * the remaining caps are laid out on both sides of that anchor.
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
import { getDecouplingRailNetId } from "../../utils/getDecouplingRailNetId"

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
 * 2-pin caps that agree on a pin axis, with at most one fixed cap. A single fixed
 * cap can safely anchor the row; multiple fixed caps may encode constraints that a
 * one-dimensional row cannot satisfy, so those fall back to the generic packer.
 */
export const canLayoutDecouplingCapRow = (
  partition: PartitionInputProblem,
): boolean => {
  if (partition.partitionType !== "decoupling_caps") return false

  const chips = Object.values(partition.chipMap)
  if (chips.length < 2) return false
  if (chips.filter((chip) => chip.fixedPosition).length > 1) return false

  let sharedPinAxis: "x" | "y" | null = null
  for (const chip of chips) {
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

  constructor(params: { partitionInputProblem: PartitionInputProblem }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
  }

  private getRotation(chip: Chip): number {
    return chip.availableRotations?.[0] ?? 0
  }

  private isOnRailNet(pinId: PinId): boolean {
    const problem = this.partitionInputProblem
    const railNetId = getDecouplingRailNetId({
      inputProblem: problem,
      netIds: Object.keys(problem.netMap),
    })
    if (!railNetId) return false
    return problem.netConnMap[`${pinId}-${railNetId}`] === true
  }

  /**
   * Offset along the pin axis that puts this cap's rail pin on the shared rail.
   * Falls back to centering the body if no rail pin is available.
   */
  private getRailOffset(chip: Chip, pinAxis: "x" | "y"): number {
    const railPinId = chip.pins.find((pinId) => this.isOnRailNet(pinId))
    if (!railPinId) return 0

    const pin = this.partitionInputProblem.chipPinMap[railPinId]
    if (!pin) return 0

    return -rotatePinOffset(pin.offset, this.getRotation(chip))[pinAxis]
  }

  private getRowDirection(rowAxis: "x" | "y"): 1 | -1 {
    const mainChipSide = this.partitionInputProblem.decouplingMainChipSide
    const placeFirstChipAtPositiveEnd =
      (rowAxis === "x" && mainChipSide === "x-") ||
      (rowAxis === "y" && mainChipSide === "y-")
    return placeFirstChipAtPositiveEnd ? -1 : 1
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
    const rowDirection = this.getRowDirection(rowAxis)
    const fixedIndex = chips.findIndex((chip) => chip.fixedPosition)
    const chipPlacements: Record<ChipId, Placement> = {}

    if (fixedIndex === -1) {
      const rowLength =
        extents.reduce((sum, extent) => sum + extent, 0) +
        gap * (chips.length - 1)
      let cursor = rowDirection === 1 ? -rowLength / 2 : rowLength / 2

      chips.forEach((chip, index) => {
        const extent = extents[index]!
        const placement: Placement = {
          x: 0,
          y: 0,
          ccwRotationDegrees: this.getRotation(chip),
        }
        placement[rowAxis] = cursor + (rowDirection * extent) / 2
        placement[pinAxis] = this.getRailOffset(chip, pinAxis)
        chipPlacements[chip.chipId] = placement
        cursor += rowDirection * (extent + gap)
      })
    } else {
      const anchor = chips[fixedIndex]!
      const anchorPosition = anchor.fixedPosition!
      const anchorPlacement: Placement = {
        x: anchorPosition.x,
        y: anchorPosition.y,
        ccwRotationDegrees: this.getRotation(anchor),
      }
      chipPlacements[anchor.chipId] = anchorPlacement

      // getRailOffset is the center coordinate needed to put the rail at zero.
      // Therefore the anchor's actual rail coordinate is center - offset.
      const railCoordinate =
        anchorPosition[pinAxis] - this.getRailOffset(anchor, pinAxis)

      for (let index = fixedIndex + 1; index < chips.length; index++) {
        const chip = chips[index]!
        const previousChip = chips[index - 1]!
        const previousPlacement = chipPlacements[previousChip.chipId]!
        const placement: Placement = {
          x: 0,
          y: 0,
          ccwRotationDegrees: this.getRotation(chip),
        }
        placement[rowAxis] =
          previousPlacement[rowAxis] +
          rowDirection * (extents[index - 1]! / 2 + gap + extents[index]! / 2)
        placement[pinAxis] = railCoordinate + this.getRailOffset(chip, pinAxis)
        chipPlacements[chip.chipId] = placement
      }

      for (let index = fixedIndex - 1; index >= 0; index--) {
        const chip = chips[index]!
        const nextChip = chips[index + 1]!
        const nextPlacement = chipPlacements[nextChip.chipId]!
        const placement: Placement = {
          x: 0,
          y: 0,
          ccwRotationDegrees: this.getRotation(chip),
        }
        placement[rowAxis] =
          nextPlacement[rowAxis] -
          rowDirection * (extents[index]! / 2 + gap + extents[index + 1]! / 2)
        placement[pinAxis] = railCoordinate + this.getRailOffset(chip, pinAxis)
        chipPlacements[chip.chipId] = placement
      }
    }

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
