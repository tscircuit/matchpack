import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { InputProblem, ChipId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

interface ChipBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface OverlapViolation {
  chip1: ChipId
  chip2: ChipId
  overlapX: number
  overlapY: number
}

interface SpacingViolation {
  chip1: ChipId
  chip2: ChipId
  gap: number
  requiredGap: number
}

export class LayoutConstraintSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  outputLayout: OutputLayout

  chipBoundsCache: Map<ChipId, ChipBounds> = new Map()
  readonly MIN_CHIP_GAP = 0.15
  readonly MAX_ITERATIONS = 500

  violations: Array<OverlapViolation | SpacingViolation> = []

  constructor(params: {
    inputProblem: InputProblem
    inputLayout: OutputLayout
  }) {
    super()
    this.inputProblem = params.inputProblem
    this.inputLayout = params.inputLayout
    this.outputLayout = structuredClone(params.inputLayout)
  }

  override _step() {
    if (this.iterations > this.MAX_ITERATIONS) {
      this.solved = true
      return
    }

    this.chipBoundsCache.clear()
    this.violations = this.detectViolations()

    if (this.violations.length === 0) {
      this.solved = true
      return
    }

    this.resolveViolations()
  }

  private getChipBounds(chipId: ChipId): ChipBounds {
    const cached = this.chipBoundsCache.get(chipId)
    if (cached) return cached

    const chip = this.inputProblem.chipMap[chipId]
    const placement = this.outputLayout.chipPlacements[chipId]
    if (!chip || !placement) {
      const fallback: ChipBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
      this.chipBoundsCache.set(chipId, fallback)
      return fallback
    }

    const halfW = chip.size.x / 2
    const halfH = chip.size.y / 2
    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))
    const rw = halfW * cos + halfH * sin
    const rh = halfW * sin + halfH * cos

    const bounds: ChipBounds = {
      minX: placement.x - rw,
      maxX: placement.x + rw,
      minY: placement.y - rh,
      maxY: placement.y + rh,
    }
    this.chipBoundsCache.set(chipId, bounds)
    return bounds
  }

  private detectViolations(): Array<OverlapViolation | SpacingViolation> {
    const violations: Array<OverlapViolation | SpacingViolation> = []
    const chipIds = Object.keys(this.outputLayout.chipPlacements)

    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const idA = chipIds[i]!
        const idB = chipIds[j]!
        const ba = this.getChipBounds(idA)
        const bb = this.getChipBounds(idB)

        const overlapX = Math.min(ba.maxX, bb.maxX) - Math.max(ba.minX, bb.minX)
        const overlapY = Math.min(ba.maxY, bb.maxY) - Math.max(ba.minY, bb.minY)

        if (overlapX > 0 && overlapY > 0) {
          violations.push({ chip1: idA, chip2: idB, overlapX, overlapY })
        } else {
          const gapX = Math.max(ba.minX, bb.minX) - Math.min(ba.maxX, bb.maxX)
          const gapY = Math.max(ba.minY, bb.minY) - Math.min(ba.maxY, bb.maxY)
          const minGap = Math.max(gapX > 0 ? gapX : Infinity, gapY > 0 ? gapY : Infinity)
          if (minGap < this.MIN_CHIP_GAP && minGap > 0) {
            violations.push({ chip1: idA, chip2: idB, gap: minGap, requiredGap: this.MIN_CHIP_GAP })
          }
        }
      }
    }
    return violations
  }

  private resolveViolations() {
    const displacements = new Map<ChipId, { dx: number; dy: number }>()

    for (const v of this.violations) {
      if ("overlapX" in v && "overlapY" in v) {
        const ba = this.getChipBounds(v.chip1)
        const bb = this.getChipBounds(v.chip2)
        const centerAX = (ba.minX + ba.maxX) / 2
        const centerAY = (ba.minY + ba.maxY) / 2
        const centerBX = (bb.minX + bb.maxX) / 2
        const centerBY = (bb.minY + bb.maxY) / 2
        const dx = centerAX - centerBX
        const dy = centerAY - centerBY

        const pushX = (v as OverlapViolation).overlapX * 0.5 + this.MIN_CHIP_GAP
        const pushY = (v as OverlapViolation).overlapY * 0.5 + this.MIN_CHIP_GAP

        if (Math.abs(dx) > Math.abs(dy)) {
          const dir = dx >= 0 ? 1 : -1
          this.applyDisplacement(displacements, v.chip1, { dx: dir * pushX, dy: 0 })
          this.applyDisplacement(displacements, v.chip2, { dx: -dir * pushX, dy: 0 })
        } else {
          const dir = dy >= 0 ? 1 : -1
          this.applyDisplacement(displacements, v.chip1, { dx: 0, dy: dir * pushY })
          this.applyDisplacement(displacements, v.chip2, { dx: 0, dy: -dir * pushY })
        }
      }
    }

    for (const [chipId, disp] of displacements) {
      const p = this.outputLayout.chipPlacements[chipId]
      if (p) {
        p.x += disp.dx
        p.y += disp.dy
      }
    }
  }

  private applyDisplacement(
    map: Map<ChipId, { dx: number; dy: number }>,
    chipId: ChipId,
    delta: { dx: number; dy: number },
  ) {
    const existing = map.get(chipId) ?? { dx: 0, dy: 0 }
    existing.dx += delta.dx
    existing.dy += delta.dy
    map.set(chipId, existing)
  }

  getOutputLayout(): OutputLayout {
    return this.outputLayout
  }

  override visualize(): GraphicsObject {
    const layout = doBasicInputProblemLayout(this.inputProblem)
    const gfx = visualizeInputProblem(this.inputProblem, layout)

    for (const [chipId, placement] of Object.entries(this.outputLayout.chipPlacements)) {
      const chip = this.inputProblem.chipMap[chipId]
      if (!chip) continue
      gfx.rects!.push({
        center: { x: placement.x, y: placement.y },
        width: chip.size.x,
        height: chip.size.y,
        strokeColor: this.violations.length > 0 ? "red" : "green",
        strokeWidth: 0.03,
      })
      gfx.texts!.push({
        x: placement.x,
        y: placement.y - chip.size.y / 2 - 0.15,
        text: chipId,
      })
    }

    for (const v of this.violations) {
      if ("overlapX" in v) {
        const ba = this.getChipBounds(v.chip1)
        const bb = this.getChipBounds(v.chip2)
        gfx.rects!.push({
          center: {
            x: (Math.max(ba.minX, bb.minX) + Math.min(ba.maxX, bb.maxX)) / 2,
            y: (Math.max(ba.minY, bb.minY) + Math.min(ba.maxY, bb.maxY)) / 2,
          },
          width: Math.min(ba.maxX, bb.maxX) - Math.max(ba.minX, bb.minX),
          height: Math.min(ba.maxY, bb.maxY) - Math.max(ba.minY, bb.minY),
          fill: "rgba(255,0,0,0.3)",
          strokeColor: "red",
        })
      }
    }

    return gfx
  }
}
