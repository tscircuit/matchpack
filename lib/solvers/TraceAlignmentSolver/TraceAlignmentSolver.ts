import { BaseSolver } from "../BaseSolver"
import type { InputProblem, PinId, ChipId } from "lib/types/InputProblem"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import type { Point } from "@tscircuit/math-utils"

export class TraceAlignmentSolver extends BaseSolver {
  inputProblem: InputProblem
  outputLayout: OutputLayout
  override MAX_ITERATIONS = 20

  constructor(params: {
    inputProblem: InputProblem
    outputLayout: OutputLayout
  }) {
    super()
    this.inputProblem = params.inputProblem
    this.outputLayout = JSON.parse(JSON.stringify(params.outputLayout))
  }

  override _step() {
    let nudgedAny = false

    const strongConnections = Object.entries(this.inputProblem.pinStrongConnMap)
      .filter(([_, connected]) => connected)
      .map(([connKey]) => connKey.split("-") as [PinId, PinId])

    for (const [pinIdA, pinIdB] of strongConnections) {
      const chipIdA = this.getChipIdForPin(pinIdA)
      const chipIdB = this.getChipIdForPin(pinIdB)

      if (!chipIdA || !chipIdB || chipIdA === chipIdB) continue

      const posA = this.getAbsolutePositionForPin(pinIdA)
      const posB = this.getAbsolutePositionForPin(pinIdB)
      if (!posA || !posB) continue

      const dx = Math.abs(posA.x - posB.x)
      const dy = Math.abs(posA.y - posB.y)

      const threshold = 1.0

      // Determine which axis to align based on proximity
      const alignX = dx > 0 && dx < threshold && (dy === 0 || dx < dy)
      const alignY = dy > 0 && dy < threshold && (dx === 0 || dy < dx)

      if (!alignX && !alignY) continue

      const pinsA = this.inputProblem.chipMap[chipIdA]?.pins.length || 0
      const pinsB = this.inputProblem.chipMap[chipIdB]?.pins.length || 0

      // Sort chips: nudge the one with fewer pins (or smaller ID)
      const [toNudge, target] =
        pinsA < pinsB || (pinsA === pinsB && chipIdA < chipIdB)
          ? [
              { id: chipIdA, pos: posA },
              { id: chipIdB, pos: posB },
            ]
          : [
              { id: chipIdB, pos: posB },
              { id: chipIdA, pos: posA },
            ]

      const nudge = alignX
        ? { x: target.pos.x - toNudge.pos.x, y: 0 }
        : { x: 0, y: target.pos.y - toNudge.pos.y }

      if (this.tryNudge(toNudge.id, nudge)) {
        nudgedAny = true
      }
    }

    if (!nudgedAny || this.iterations >= this.MAX_ITERATIONS) {
      this.solved = true
    }
  }

  private tryNudge(chipId: ChipId, nudge: { x: number; y: number }): boolean {
    if (Math.abs(nudge.x) < 1e-6 && Math.abs(nudge.y) < 1e-6) return false

    const placement = this.outputLayout.chipPlacements[chipId]
    if (!placement) return false

    const originalX = placement.x
    const originalY = placement.y

    placement.x += nudge.x
    placement.y += nudge.y

    if (this.hasOverlaps(chipId)) {
      placement.x = originalX
      placement.y = originalY
      return false
    }

    return true
  }

  private hasOverlaps(chipId: ChipId): boolean {
    const chipIds = Object.keys(this.outputLayout.chipPlacements)
    const placement1 = this.outputLayout.chipPlacements[chipId]!
    const chip1 = this.inputProblem.chipMap[chipId]!
    const bounds1 = this.getRotatedBounds(placement1, chip1.size)

    for (const otherId of chipIds) {
      if (otherId === chipId) continue

      const placement2 = this.outputLayout.chipPlacements[otherId]!
      const chip2 = this.inputProblem.chipMap[otherId]!
      const bounds2 = this.getRotatedBounds(placement2, chip2.size)

      // Use a slightly larger epsilon for overlaps to avoid precision issues
      if (this.calculateOverlapArea(bounds1, bounds2) > 0.0001) {
        return true
      }
    }
    return false
  }

  private getChipIdForPin(pinId: PinId): ChipId | null {
    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      if (chip.pins.includes(pinId)) return chipId
    }
    return null
  }

  private getAbsolutePositionForPin(pinId: PinId): Point | null {
    const chipPin = this.inputProblem.chipPinMap[pinId]
    const chipId = this.getChipIdForPin(pinId)
    if (!chipPin || !chipId) return null

    const placement = this.outputLayout.chipPlacements[chipId]
    if (!placement) return null

    const rotatedOffset = this.rotatePoint(
      chipPin.offset,
      placement.ccwRotationDegrees,
    )
    return {
      x: placement.x + rotatedOffset.x,
      y: placement.y + rotatedOffset.y,
    }
  }

  private rotatePoint(point: Point, angleDegrees: number): Point {
    const angleRad = (angleDegrees * Math.PI) / 180
    const cos = Math.cos(angleRad)
    const sin = Math.sin(angleRad)
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
    }
  }

  private getRotatedBounds(
    placement: Placement,
    size: Point,
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))
    const rotatedWidth = size.x * cos + size.y * sin
    const rotatedHeight = size.x * sin + size.y * cos
    return {
      minX: placement.x - rotatedWidth / 2,
      maxX: placement.x + rotatedWidth / 2,
      minY: placement.y - rotatedHeight / 2,
      maxY: placement.y + rotatedHeight / 2,
    }
  }

  private calculateOverlapArea(
    b1: { minX: number; maxX: number; minY: number; maxY: number },
    b2: { minX: number; maxX: number; minY: number; maxY: number },
  ): number {
    const overlapWidth = Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX)
    const overlapHeight =
      Math.min(b1.maxY, b2.maxY) - Math.max(b1.minY, b2.minY)
    if (overlapWidth <= 0 || overlapHeight <= 0) return 0
    return overlapWidth * overlapHeight
  }

  override getConstructorParams(): [any] {
    return [
      { inputProblem: this.inputProblem, outputLayout: this.outputLayout },
    ]
  }
}
