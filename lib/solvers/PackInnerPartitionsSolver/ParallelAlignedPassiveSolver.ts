/**
 * Inner-partition layout solver for a partition that contains a same-side passive
 * group (see findSameSidePassiveGroups) — e.g. the BQ24074's R1/R2/R3 attached to
 * U1's bottom (ITERM/ILIM/ISET) or right (EN2/EN1/TMR) edge.
 *
 * It runs the normal calculate-packing layout (via SingleInnerPartitionPackingSolver)
 * and then re-flows ONLY the detected group(s) into a clean, evenly-spaced
 * horizontal row just outside the main-chip edge — pushed left/right/up/down
 * depending on which edge the group attaches to — ordered by the connecting
 * main-chip pin and kept at least chipGap from neighbouring components. Every
 * other component stays exactly where calculate-packing placed it, and each
 * passive keeps its (fixed, typically vertical) rotation.
 *
 * Sibling to SingleInnerPartitionPackingSolver; PackInnerPartitionsSolver
 * dispatches to it by partition contents. If a group cannot be re-flowed cleanly
 * it is left at its packed position, so the result is never worse.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  ChipId,
  ChipPin,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { Side } from "../../types/Side"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import {
  findSameSidePassiveGroups,
  type SameSidePassiveGroup,
} from "./findSameSidePassiveGroups"
import { SingleInnerPartitionPackingSolver } from "./SingleInnerPartitionPackingSolver"
import {
  type Bounds,
  boundsDistance,
  getBoundsCenter,
  getBoundsFromPoints,
} from "@tscircuit/math-utils"

const CLEARANCE_EPSILON = 1e-6
const MAX_RESOLVE_ITERATIONS = 16

/** Outward unit vector (main-chip centre → edge) for each side. */
const OUTWARD_BY_SIDE: Record<Side, { x: number; y: number }> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

/** Gap between two bounds along a single axis (0 if they overlap on that axis). */
const axisGap = (a: Bounds, b: Bounds, axis: "x" | "y"): number => {
  if (axis === "x") return Math.max(0, a.minX - b.maxX, b.minX - a.maxX)
  return Math.max(0, a.minY - b.maxY, b.minY - a.maxY)
}

export class ParallelAlignedPassiveSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  declare activeSubSolver: SingleInnerPartitionPackingSolver | null

  private packingSolver: SingleInnerPartitionPackingSolver | null = null

  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.pinIdToStronglyConnectedPins = params.pinIdToStronglyConnectedPins
  }

  override _step() {
    // Run the normal packer first; the group re-flow is layered on top of it.
    if (!this.packingSolver) {
      this.packingSolver = new SingleInnerPartitionPackingSolver({
        partitionInputProblem: this.partitionInputProblem,
        pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
      })
      this.activeSubSolver = this.packingSolver
    }

    this.packingSolver.step()

    if (this.packingSolver.failed) {
      this.failed = true
      this.error = this.packingSolver.error
      return
    }

    if (this.packingSolver.solved && this.packingSolver.layout) {
      this.layout = this.alignPassiveGroups(this.packingSolver.layout)
      this.activeSubSolver = null
      this.solved = true
    }
  }

  private alignPassiveGroups(base: OutputLayout): OutputLayout {
    const placements: Record<ChipId, Placement> = {}
    for (const [chipId, placement] of Object.entries(base.chipPlacements)) {
      placements[chipId] = { ...placement }
    }
    for (const passiveGroup of findSameSidePassiveGroups(
      this.partitionInputProblem,
    )) {
      this.reflowPassiveGroup(placements, passiveGroup)
    }
    return { chipPlacements: placements, groupPlacements: base.groupPlacements }
  }

  private reflowPassiveGroup(
    placements: Record<ChipId, Placement>,
    passiveGroup: SameSidePassiveGroup,
  ): void {
    const prob = this.partitionInputProblem
    const gap = prob.chipGap
    const mainChipPlacement = placements[passiveGroup.mainChipId]
    if (!mainChipPlacement) return

    // Outward direction from the main-chip centre to the edge this group attaches
    // to. A left/right edge means the row is pushed along x ("horizontal" side).
    const outward = OUTWARD_BY_SIDE[passiveGroup.side]
    const sideIsHorizontal = outward.x !== 0

    // Pin-inclusive main-chip box, so the group clears main-chip pins that
    // protrude past the body (e.g. U1's left/right pins reach beyond the body).
    const mainChipBox = this.boxFor(passiveGroup.mainChipId, mainChipPlacement)
    const mainChipCenter = getBoundsCenter(mainChipBox)

    // Centroid of the main-chip pins this group connects to, so the row lines up
    // with the connection region.
    const mainChipPinPositions = passiveGroup.mainChipPinIds.map((pinId) => {
      const rotatedOffset = rotatePinOffset(
        prob.chipPinMap[pinId]!.offset,
        mainChipPlacement.ccwRotationDegrees,
      )
      return {
        x: mainChipPlacement.x + rotatedOffset.x,
        y: mainChipPlacement.y + rotatedOffset.y,
      }
    })
    let mainChipPinCentroid = mainChipCenter
    if (mainChipPinPositions.length > 0) {
      const sumX = mainChipPinPositions.reduce((s, p) => s + p.x, 0)
      const sumY = mainChipPinPositions.reduce((s, p) => s + p.y, 0)
      mainChipPinCentroid = {
        x: sumX / mainChipPinPositions.length,
        y: sumY / mainChipPinPositions.length,
      }
    }

    // Always a horizontal row: passives vary in x at a shared y, ordered by their
    // connecting main-chip pin, each keeping its fixed (vertical) rotation.
    const sizes = passiveGroup.passiveChipIds.map((id) =>
      getRotatedSize(
        prob.chipMap[id]!.size,
        placements[id]!.ccwRotationDegrees,
      ),
    )
    const rowXOffsets: number[] = []
    let cursor = 0
    for (let i = 0; i < sizes.length; i++) {
      rowXOffsets[i] = cursor + sizes[i]!.x / 2
      cursor += sizes[i]!.x + gap
    }
    const rowWidth = Math.max(0, cursor - gap)
    for (let i = 0; i < rowXOffsets.length; i++) rowXOffsets[i]! -= rowWidth / 2
    const rowHeight = Math.max(...sizes.map((s) => s.y))

    // Push the row off the main chip along the outward axis and align it to the
    // pin centroid along the edge. The outward axis differs for horizontal vs
    // vertical edges, so resolve the base (pre-slide) centre once here.
    let baseRowCentreX: number
    let baseRowCentreY: number
    if (sideIsHorizontal) {
      const outwardDistance =
        (mainChipBox.maxX - mainChipBox.minX) / 2 + gap + rowWidth / 2
      baseRowCentreX = mainChipCenter.x + outward.x * outwardDistance
      baseRowCentreY = mainChipPinCentroid.y
    } else {
      const outwardDistance =
        (mainChipBox.maxY - mainChipBox.minY) / 2 + gap + rowHeight / 2
      baseRowCentreX = mainChipPinCentroid.x
      baseRowCentreY = mainChipCenter.y + outward.y * outwardDistance
    }

    const passiveChipIdSet = new Set(passiveGroup.passiveChipIds)

    // Slide the row along its own (x) axis until it keeps chipGap from every
    // neighbouring (non-group) chip. If it can't be cleared by sliding, keep the
    // packed positions for this group — those are already overlap-free.
    const maxSlide = mainChipBox.maxX - mainChipBox.minX + rowWidth
    let slide = 0
    for (let iter = 0; iter < MAX_RESOLVE_ITERATIONS; iter++) {
      // Build the candidate row at the current slide offset.
      const rowCentreX = baseRowCentreX + slide
      const rowCentreY = baseRowCentreY
      const candidate: Record<ChipId, Placement> = {}
      for (let i = 0; i < passiveGroup.passiveChipIds.length; i++) {
        const id = passiveGroup.passiveChipIds[i]!
        candidate[id] = {
          x: rowCentreX + rowXOffsets[i]!,
          y: rowCentreY,
          // Keep the packed (fixed) rotation; only reposition.
          ccwRotationDegrees: placements[id]!.ccwRotationDegrees,
        }
      }

      const adjustment = this.clearanceAdjustment(
        candidate,
        placements,
        passiveChipIdSet,
        gap,
      )
      if (adjustment === 0) {
        for (const id of passiveGroup.passiveChipIds) {
          placements[id] = candidate[id]!
        }
        return
      }
      if (adjustment === null) return // crowded from both sides -> keep packed
      const next = slide + adjustment
      if (Math.abs(next) > maxSlide) return
      slide = next
    }
  }

  /**
   * Signed x shift needed to keep the candidate row at least `gap` from every
   * non-group chip (the row only ever moves along x). 0 = already clear; null =
   * crowded from both x directions (cannot be resolved by sliding).
   */
  private clearanceAdjustment(
    candidate: Record<ChipId, Placement>,
    placements: Record<ChipId, Placement>,
    passiveChipIdSet: Set<ChipId>,
    gap: number,
  ): number | null {
    let needPlus = 0
    let needMinus = 0
    for (const [passiveChipId, passivePlacement] of Object.entries(candidate)) {
      const passiveBox = this.boxFor(passiveChipId, passivePlacement)
      for (const [otherChipId, otherPlacement] of Object.entries(placements)) {
        if (passiveChipIdSet.has(otherChipId)) continue
        const otherBox = this.boxFor(otherChipId, otherPlacement)
        if (boundsDistance(passiveBox, otherBox) >= gap - CLEARANCE_EPSILON) {
          continue
        }

        // How much x-gap is needed to reach `gap` clearance at this y overlap.
        const yGap = axisGap(passiveBox, otherBox, "y")
        const xGap = axisGap(passiveBox, otherBox, "x")
        const neededX = Math.sqrt(Math.max(0, gap * gap - yGap * yGap))
        const deficit = neededX - xGap
        if (deficit <= CLEARANCE_EPSILON) continue

        if (getBoundsCenter(passiveBox).x >= getBoundsCenter(otherBox).x) {
          needPlus = Math.max(needPlus, deficit)
        } else {
          needMinus = Math.max(needMinus, deficit)
        }
      }
    }
    if (needPlus > CLEARANCE_EPSILON && needMinus > CLEARANCE_EPSILON)
      return null
    if (needPlus > CLEARANCE_EPSILON) return needPlus
    if (needMinus > CLEARANCE_EPSILON) return -needMinus
    return 0
  }

  /**
   * Axis-aligned bounding box for a chip including any pins that protrude beyond
   * its body (e.g. BT1's pins stick out toward the main chip), so clearance is
   * measured against the pins, not just the body.
   */
  private boxFor(chipId: ChipId, placement: Placement): Bounds {
    const chip = this.partitionInputProblem.chipMap[chipId]!
    const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
    // Body corners plus every (rotated) pin position, so the box also covers
    // pins that protrude past the body edge.
    const points = [
      { x: placement.x - size.x / 2, y: placement.y - size.y / 2 },
      { x: placement.x + size.x / 2, y: placement.y + size.y / 2 },
    ]
    for (const pinId of chip.pins) {
      const pin = this.partitionInputProblem.chipPinMap[pinId]
      if (!pin) continue
      const rotatedOffset = rotatePinOffset(
        pin.offset,
        placement.ccwRotationDegrees,
      )
      points.push({
        x: placement.x + rotatedOffset.x,
        y: placement.y + rotatedOffset.y,
      })
    }
    return getBoundsFromPoints(points)!
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver && !this.solved) {
      return this.activeSubSolver.visualize()
    }
    if (!this.layout) {
      const basicLayout = doBasicInputProblemLayout(this.partitionInputProblem)
      return visualizeInputProblem(this.partitionInputProblem, basicLayout)
    }
    return visualizeInputProblem(this.partitionInputProblem, this.layout)
  }

  override getConstructorParams(): [InputProblem] {
    return [this.partitionInputProblem]
  }
}
