import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { InputProblem } from "../../types/InputProblem"

export interface LayoutRefinementSolverInput {
  inputProblem: InputProblem
  initialLayout: OutputLayout
}

export class LayoutRefinementSolver extends BaseSolver {
  inputProblem: InputProblem
  initialLayout: OutputLayout
  refinedLayout: OutputLayout
  refinedChipPlacements: Record<string, Placement>
  chipIds: string[]
  iteration: number
  maxIterations = 100
  dampingFactor = 0.5

  constructor(input: LayoutRefinementSolverInput) {
    super()
    this.inputProblem = input.inputProblem
    this.initialLayout = input.initialLayout

    this.chipIds = Object.keys(this.initialLayout.chipPlacements)
    this.refinedChipPlacements = {}
    for (const chipId of this.chipIds) {
      this.refinedChipPlacements[chipId] = {
        ...this.initialLayout.chipPlacements[chipId]!,
      }
    }
    this.refinedLayout = {
      chipPlacements: this.refinedChipPlacements,
      groupPlacements: { ...this.initialLayout.groupPlacements },
    }
    this.iteration = 0
  }

  override _step() {
    if (this.chipIds.length === 0) {
      this.solved = true
      return
    }

    if (this.iteration >= this.maxIterations) {
      this.solved = true
      return
    }

    const overlaps = this.detectOverlaps()
    if (overlaps.length === 0) {
      this.solved = true
      return
    }

    this.applyPushApart(overlaps)
    this.iteration++
  }

  detectOverlaps(): Array<{
    chip1: string
    chip2: string
    overlapX: number
    overlapY: number
    bounds1: { minX: number; maxX: number; minY: number; maxY: number }
    bounds2: { minX: number; maxX: number; minY: number; maxY: number }
  }> {
    const overlaps: Array<{
      chip1: string
      chip2: string
      overlapX: number
      overlapY: number
      bounds1: { minX: number; maxX: number; minY: number; maxY: number }
      bounds2: { minX: number; maxX: number; minY: number; maxY: number }
    }> = []

    for (let i = 0; i < this.chipIds.length; i++) {
      for (let j = i + 1; j < this.chipIds.length; j++) {
        const chip1Id = this.chipIds[i]!
        const chip2Id = this.chipIds[j]!
        const placement1 = this.refinedChipPlacements[chip1Id]!
        const placement2 = this.refinedChipPlacements[chip2Id]!
        const chip1 = this.inputProblem.chipMap[chip1Id]
        const chip2 = this.inputProblem.chipMap[chip2Id]

        if (!chip1 || !chip2) continue

        const bounds1 = this.getAABB(placement1, chip1.size)
        const bounds2 = this.getAABB(placement2, chip2.size)

        const overlapX =
          Math.min(bounds1.maxX, bounds2.maxX) -
          Math.max(bounds1.minX, bounds2.minX)
        const overlapY =
          Math.min(bounds1.maxY, bounds2.maxY) -
          Math.max(bounds1.minY, bounds2.minY)

        if (overlapX > 0 && overlapY > 0) {
          overlaps.push({
            chip1: chip1Id,
            chip2: chip2Id,
            overlapX,
            overlapY,
            bounds1,
            bounds2,
          })
        }
      }
    }

    return overlaps
  }

  getAABB(
    placement: { x: number; y: number; ccwRotationDegrees: number },
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

  applyPushApart(
    overlaps: Array<{
      chip1: string
      chip2: string
      overlapX: number
      overlapY: number
      bounds1: { minX: number; maxX: number; minY: number; maxY: number }
      bounds2: { minX: number; maxX: number; minY: number; maxY: number }
    }>,
  ) {
    const displacements: Record<string, { x: number; y: number }> = {}

    for (const chipId of this.chipIds) {
      displacements[chipId] = { x: 0, y: 0 }
    }

    const chipGap = this.inputProblem.chipGap ?? 0

    for (const overlap of overlaps) {
      const { chip1, chip2, overlapX, overlapY, bounds1, bounds2 } = overlap

      let pushX = 0
      let pushY = 0

      if (overlapX < overlapY) {
        pushX =
          overlapX + chipGap * (bounds1.maxX > bounds2.maxX ? 1 : -1) * 0.5
        const signX = bounds1.minX < bounds2.minX ? -1 : 1
        const pushAmount = (overlapX + chipGap) * 0.5 * this.dampingFactor
        pushX = pushAmount * signX
      } else {
        const signY = bounds1.minY < bounds2.minY ? -1 : 1
        const pushAmount = (overlapY + chipGap) * 0.5 * this.dampingFactor
        pushY = pushAmount * signY
      }

      displacements[chip1]!.x -= pushX
      displacements[chip1]!.y -= pushY
      displacements[chip2]!.x += pushX
      displacements[chip2]!.y += pushY
    }

    for (const chipId of this.chipIds) {
      const d = displacements[chipId]!
      this.refinedChipPlacements[chipId] = {
        ...this.refinedChipPlacements[chipId]!,
        x: this.refinedChipPlacements[chipId]!.x + d.x,
        y: this.refinedChipPlacements[chipId]!.y + d.y,
      }
    }
  }

  override visualize(): GraphicsObject {
    const rects: GraphicsObject["rects"] = []
    const texts: GraphicsObject["texts"] = []

    for (const chipId of this.chipIds) {
      const placement = this.refinedChipPlacements[chipId]!
      const chip = this.inputProblem.chipMap[chipId]
      if (!chip) continue

      const { size } = chip
      let displayW = size.x
      let displayH = size.y
      if (
        placement.ccwRotationDegrees === 90 ||
        placement.ccwRotationDegrees === 270
      ) {
        displayW = size.y
        displayH = size.x
      }

      const color =
        this.iteration === 0
          ? "rgba(0,100,200,0.6)"
          : this.solved
            ? "rgba(0,180,0,0.7)"
            : "rgba(200,100,0,0.6)"

      rects.push({
        center: { x: placement.x, y: placement.y },
        width: displayW,
        height: displayH,
        fill: color,
        stroke: "black",
        label: chipId,
      })

      texts.push({
        position: { x: placement.x, y: placement.y },
        text: chipId,
        fontSize: 0.15,
        align: "center",
      })
    }

    const overlaps = this.detectOverlaps()
    for (const overlap of overlaps) {
      const p1 = this.refinedChipPlacements[overlap.chip1]!
      const p2 = this.refinedChipPlacements[overlap.chip2]!
      rects.push({
        center: {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
        },
        width: Math.abs(p2.x - p1.x) + 0.1,
        height: Math.abs(p2.y - p1.y) + 0.1,
        fill: "rgba(255,0,0,0.25)",
        stroke: "red",
        label: `overlap: ${overlap.chip1}-${overlap.chip2}`,
      })
    }

    return { rects: rects.length > 0 ? rects : undefined, texts }
  }

  override getConstructorParams(): LayoutRefinementSolverInput {
    return {
      inputProblem: this.inputProblem,
      initialLayout: this.initialLayout,
    }
  }
}
