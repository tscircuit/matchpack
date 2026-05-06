/**
 * Post-pack overlap resolution solver.
 * Detects and resolves chip overlaps in the final layout by nudging
 * overlapping chips apart using deterministic pairwise displacement.
 */

import { BaseSolver } from "../BaseSolver"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { GraphicsObject } from "graphics-debug"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export interface OverlapResolutionSolverInput {
  layout: OutputLayout
  inputProblem: InputProblem
}

export class OverlapResolutionSolver extends BaseSolver {
  layout: OutputLayout
  inputProblem: InputProblem
  resolvedLayout: OutputLayout | null = null

  constructor(input: OverlapResolutionSolverInput) {
    super()
    this.layout = input.layout
    this.inputProblem = input.inputProblem
    this.MAX_ITERATIONS = 200
  }

  override _step() {
    // Clone current placements to work on
    const placements = this.resolvedLayout
      ? { ...this.resolvedLayout.chipPlacements }
      : { ...this.layout.chipPlacements }

    // Detect current overlaps
    const overlaps = this.detectOverlaps(placements)

    if (overlaps.length === 0) {
      // No overlaps remaining — done
      this.resolvedLayout = {
        chipPlacements: placements,
        groupPlacements:
          this.resolvedLayout?.groupPlacements ?? this.layout.groupPlacements,
      }
      this.solved = true
      return
    }

    // Resolve the worst overlap first (largest overlap area)
    const sorted = overlaps.sort((a, b) => b.overlapArea - a.overlapArea)
    const worst = sorted[0]!

    this.resolveOverlap(worst.chip1, worst.chip2, placements)

    this.resolvedLayout = {
      chipPlacements: placements,
      groupPlacements:
        this.resolvedLayout?.groupPlacements ?? this.layout.groupPlacements,
    }
  }

  /**
   * Detect all overlapping chip pairs in the current layout
   */
  private detectOverlaps(
    placements: Record<string, Placement>,
  ): Array<{ chip1: string; chip2: string; overlapArea: number }> {
    const overlaps: Array<{
      chip1: string
      chip2: string
      overlapArea: number
    }> = []

    const chipIds = Object.keys(placements)

    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const chip1Id = chipIds[i]!
        const chip2Id = chipIds[j]!
        const placement1 = placements[chip1Id]!
        const placement2 = placements[chip2Id]!

        const chip1 = this.inputProblem.chipMap[chip1Id]
        const chip2 = this.inputProblem.chipMap[chip2Id]

        if (!chip1 || !chip2) continue

        const bounds1 = this.getRotatedBounds(placement1, chip1.size)
        const bounds2 = this.getRotatedBounds(placement2, chip2.size)

        const overlapArea = this.calculateOverlapArea(bounds1, bounds2)

        if (overlapArea > 1e-6) {
          overlaps.push({
            chip1: chip1Id,
            chip2: chip2Id,
            overlapArea,
          })
        }
      }
    }

    return overlaps
  }

  /**
   * Resolve overlap between two chips by nudging them apart.
   * The smaller chip moves more than the larger one.
   */
  private resolveOverlap(
    chip1Id: string,
    chip2Id: string,
    placements: Record<string, Placement>,
  ) {
    const p1 = placements[chip1Id]!
    const p2 = placements[chip2Id]!
    const c1 = this.inputProblem.chipMap[chip1Id]!
    const c2 = this.inputProblem.chipMap[chip2Id]!

    const bounds1 = this.getRotatedBounds(p1, c1.size)
    const bounds2 = this.getRotatedBounds(p2, c2.size)

    // Calculate minimum displacement to separate on each axis
    const overlapX =
      Math.min(bounds1.maxX, bounds2.maxX) -
      Math.max(bounds1.minX, bounds2.minX)
    const overlapY =
      Math.min(bounds1.maxY, bounds2.maxY) -
      Math.max(bounds1.minY, bounds2.minY)

    // Determine direction of separation
    const centerDX = p2.x - p1.x
    const centerDY = p2.y - p1.y

    // Weight: larger chip moves less
    const area1 = c1.size.x * c1.size.y
    const area2 = c2.size.x * c2.size.y
    const totalArea = area1 + area2
    const weight1 = area2 / totalArea
    const weight2 = area1 / totalArea

    // Add a small extra gap to avoid edge-touching
    const extraGap = Math.max(this.inputProblem.chipGap || 0.01, 0.005)

    if (overlapX < overlapY) {
      // Push apart horizontally
      const pushDistance = overlapX + extraGap
      const direction = centerDX >= 0 ? 1 : -1
      placements[chip1Id] = {
        ...p1,
        x: p1.x - direction * pushDistance * weight1,
      }
      placements[chip2Id] = {
        ...p2,
        x: p2.x + direction * pushDistance * weight2,
      }
    } else {
      // Push apart vertically
      const pushDistance = overlapY + extraGap
      const direction = centerDY >= 0 ? 1 : -1
      placements[chip1Id] = {
        ...p1,
        y: p1.y - direction * pushDistance * weight1,
      }
      placements[chip2Id] = {
        ...p2,
        y: p2.y + direction * pushDistance * weight2,
      }
    }
  }

  private getRotatedBounds(
    placement: Placement,
    size: { x: number; y: number },
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    const halfWidth = size.x / 2
    const halfHeight = size.y / 2
    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))
    const rotatedWidth = halfWidth * cos + halfHeight * sin
    const rotatedHeight = halfWidth * sin + halfHeight * cos

    return {
      minX: placement.x - rotatedWidth,
      maxX: placement.x + rotatedWidth,
      minY: placement.y - rotatedHeight,
      maxY: placement.y + rotatedHeight,
    }
  }

  private calculateOverlapArea(
    b1: { minX: number; maxX: number; minY: number; maxY: number },
    b2: { minX: number; maxX: number; minY: number; maxY: number },
  ): number {
    if (
      b1.maxX <= b2.minX ||
      b1.minX >= b2.maxX ||
      b1.maxY <= b2.minY ||
      b1.minY >= b2.maxY
    ) {
      return 0
    }
    const overlapWidth = Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX)
    const overlapHeight =
      Math.min(b1.maxY, b2.maxY) - Math.max(b1.minY, b2.minY)
    return overlapWidth * overlapHeight
  }

  override visualize(): GraphicsObject {
    if (this.resolvedLayout) {
      return visualizeInputProblem(this.inputProblem, this.resolvedLayout)
    }
    return visualizeInputProblem(this.inputProblem, this.layout)
  }

  override getConstructorParams(): OverlapResolutionSolverInput {
    return {
      layout: this.layout,
      inputProblem: this.inputProblem,
    }
  }
}
