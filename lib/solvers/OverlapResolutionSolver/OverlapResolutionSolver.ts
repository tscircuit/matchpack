/**
 * Resolves chip overlaps in a final layout by iteratively pushing overlapping
 * chip pairs apart along their minimum-separation axis. Preserves overall
 * shape: each pair-fix moves chips by the smallest amount needed, weighted by
 * chip area so anchor chips (high pin count, large size) move less than
 * passives.
 *
 * Runs as the final pipeline phase after PartitionPackingSolver. The earlier
 * stages produce a layout that's optimal in connection-distance terms but can
 * leave residual overlaps (e.g. between chips in different inner partitions
 * after the partitions are packed together). This solver enforces the
 * inputProblem.chipGap minimum spacing as a post-process.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { ChipId, InputProblem } from "lib/types/InputProblem"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"

export interface OverlapResolutionSolverInput {
  layout: OutputLayout
  inputProblem: InputProblem
  /** Minimum gap to enforce between chip bounding boxes (defaults to inputProblem.chipGap or 0.2) */
  chipGap?: number
  /** Max iterations of the relaxation loop (defaults to 200) */
  maxRelaxationIterations?: number
}

type AABB = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export class OverlapResolutionSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  finalLayout: OutputLayout
  chipGap: number
  maxRelaxationIterations: number
  relaxationIterations = 0
  resolvedOverlapCount = 0
  remainingOverlapCount = 0

  constructor(input: OverlapResolutionSolverInput) {
    super()
    this.inputProblem = input.inputProblem
    this.inputLayout = input.layout
    // Deep-clone placements so we never mutate the caller's layout objects
    this.finalLayout = {
      chipPlacements: Object.fromEntries(
        Object.entries(input.layout.chipPlacements).map(([id, p]) => [
          id,
          { ...p },
        ]),
      ),
      groupPlacements: Object.fromEntries(
        Object.entries(input.layout.groupPlacements).map(([id, p]) => [
          id,
          { ...p },
        ]),
      ),
    }
    this.chipGap = input.chipGap ?? this.inputProblem.chipGap ?? 0.2
    this.maxRelaxationIterations = input.maxRelaxationIterations ?? 200
    this.MAX_ITERATIONS = this.maxRelaxationIterations + 5
  }

  override _step() {
    const overlaps = this.detectOverlaps(this.finalLayout)

    if (overlaps.length === 0) {
      this.remainingOverlapCount = 0
      this.solved = true
      return
    }

    if (this.relaxationIterations >= this.maxRelaxationIterations) {
      // Give up — record what's left so the consumer can see we ran out
      this.remainingOverlapCount = overlaps.length
      this.solved = true
      return
    }

    // Process the worst overlap first each pass (largest area)
    overlaps.sort((a, b) => b.overlapArea - a.overlapArea)

    for (const overlap of overlaps) {
      this.separatePair(overlap.chip1, overlap.chip2)
      this.resolvedOverlapCount++
    }

    this.relaxationIterations++
  }

  /**
   * Detect all overlapping chip pairs in the layout, including the required
   * chipGap as part of the bounding box. (A gap-violation counts as an overlap.)
   */
  private detectOverlaps(layout: OutputLayout) {
    const overlaps: Array<{
      chip1: ChipId
      chip2: ChipId
      overlapArea: number
    }> = []
    const chipIds = Object.keys(layout.chipPlacements)
    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const id1 = chipIds[i]!
        const id2 = chipIds[j]!
        const bounds1 = this.getInflatedBounds(id1, layout)
        const bounds2 = this.getInflatedBounds(id2, layout)
        if (!bounds1 || !bounds2) continue
        const area = this.computeOverlapArea(bounds1, bounds2)
        if (area > 0) {
          overlaps.push({ chip1: id1, chip2: id2, overlapArea: area })
        }
      }
    }
    return overlaps
  }

  /**
   * Bounding box of a chip inflated by half the chipGap on every side, so
   * "touching" rects (gap = 0) register as an overlap and get separated.
   */
  private getInflatedBounds(chipId: ChipId, layout: OutputLayout): AABB | null {
    const chip = this.inputProblem.chipMap[chipId]
    const placement = layout.chipPlacements[chipId]
    if (!chip || !placement) return null

    const inflate = this.chipGap / 2
    const bounds = this.getRotatedAABB(placement, chip.size)
    return {
      minX: bounds.minX - inflate,
      maxX: bounds.maxX + inflate,
      minY: bounds.minY - inflate,
      maxY: bounds.maxY + inflate,
    }
  }

  /**
   * Axis-aligned bounding box of a rotated rectangle. Matches the convention
   * used by LayoutPipelineSolver.checkForOverlaps so detection stays
   * consistent across the pipeline.
   */
  private getRotatedAABB(
    placement: Placement,
    size: { x: number; y: number },
  ): AABB {
    const halfWidth = size.x / 2
    const halfHeight = size.y / 2
    const rad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    const rotatedHalfW = halfWidth * cos + halfHeight * sin
    const rotatedHalfH = halfWidth * sin + halfHeight * cos
    return {
      minX: placement.x - rotatedHalfW,
      maxX: placement.x + rotatedHalfW,
      minY: placement.y - rotatedHalfH,
      maxY: placement.y + rotatedHalfH,
    }
  }

  private computeOverlapArea(a: AABB, b: AABB): number {
    if (
      a.maxX <= b.minX ||
      a.minX >= b.maxX ||
      a.maxY <= b.minY ||
      a.minY >= b.maxY
    ) {
      return 0
    }
    const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
    const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
    return w * h
  }

  /**
   * Push two overlapping chips apart along the minimum-penetration axis.
   * Movement is split between the two chips proportional to the inverse of
   * their area, so a small passive moves more than a large anchor chip.
   */
  private separatePair(id1: ChipId, id2: ChipId) {
    const b1 = this.getInflatedBounds(id1, this.finalLayout)
    const b2 = this.getInflatedBounds(id2, this.finalLayout)
    const p1 = this.finalLayout.chipPlacements[id1]
    const p2 = this.finalLayout.chipPlacements[id2]
    if (!b1 || !b2 || !p1 || !p2) return

    // Penetration depth on each axis. We want to push them apart along
    // the axis of *minimum* penetration so the move is the smallest
    // possible nudge that resolves the overlap.
    const penX = Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX)
    const penY = Math.min(b1.maxY, b2.maxY) - Math.max(b1.minY, b2.minY)
    if (penX <= 0 || penY <= 0) return // already separated

    // Add a tiny epsilon so we cross the equality boundary cleanly.
    const epsilon = 1e-6
    const c1x = (b1.minX + b1.maxX) / 2
    const c1y = (b1.minY + b1.maxY) / 2
    const c2x = (b2.minX + b2.maxX) / 2
    const c2y = (b2.minY + b2.maxY) / 2

    // Weight movement by inverse area so the smaller chip moves more.
    // (Bigger chips are more likely to be anchors — RP2040, MCUs, etc.)
    const area1 = this.areaOf(b1)
    const area2 = this.areaOf(b2)
    const w1 = area2 / (area1 + area2)
    const w2 = area1 / (area1 + area2)

    if (penX < penY) {
      // Separate horizontally
      const push = penX + epsilon
      if (c1x <= c2x) {
        p1.x -= push * w1
        p2.x += push * w2
      } else {
        p1.x += push * w1
        p2.x -= push * w2
      }
    } else {
      // Separate vertically
      const push = penY + epsilon
      if (c1y <= c2y) {
        p1.y -= push * w1
        p2.y += push * w2
      } else {
        p1.y += push * w1
        p2.y -= push * w2
      }
    }
  }

  private areaOf(b: AABB): number {
    return (b.maxX - b.minX) * (b.maxY - b.minY)
  }

  override visualize(): GraphicsObject {
    const rects = Object.entries(this.finalLayout.chipPlacements).map(
      ([chipId, placement]) => {
        const chip = this.inputProblem.chipMap[chipId]!
        const aabb = this.getRotatedAABB(placement, chip.size)
        return {
          center: { x: placement.x, y: placement.y },
          width: aabb.maxX - aabb.minX,
          height: aabb.maxY - aabb.minY,
          fill: "rgba(80,180,255,0.15)",
          stroke: "rgba(80,180,255,0.8)",
          label: chipId,
        }
      },
    )
    return {
      lines: [],
      points: [],
      circles: [],
      texts: [],
      rects,
    }
  }
}
