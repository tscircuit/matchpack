import { BaseSolver } from "../BaseSolver"
import type { OutputLayout } from "../../types/OutputLayout"

/**
 * OverlapResolutionSolver nudges overlapping chips apart for clarity.
 */
export class OverlapResolutionSolver extends BaseSolver {
  inputLayout: OutputLayout
  chipMap?: Record<string, { size: { x: number; y: number } }>
  outputLayout: OutputLayout | null = null
  override solved = false

  constructor(
    inputLayout: OutputLayout,
    chipMap?: Record<string, { size: { x: number; y: number } }>,
  ) {
    super()
    this.inputLayout = inputLayout
    this.chipMap = chipMap
  }

  override _step() {
    // Iteratively resolve overlaps until none remain or max iterations reached
    const placements = { ...this.inputLayout.chipPlacements }
    const chipIds = Object.keys(placements)
    const minGap = 0.2
    const maxIterations = 100
    let iteration = 0
    let moved = false

    do {
      moved = false
      for (let i = 0; i < chipIds.length; i++) {
        for (let j = i + 1; j < chipIds.length; j++) {
          const chipIdA = chipIds[i]
          const chipIdB = chipIds[j]
          if (chipIdA === undefined || chipIdB === undefined) continue
          const a = placements[chipIdA]
          const b = placements[chipIdB]
          if (!a || !b) continue
          const sizeA = this.chipMap?.[chipIdA]?.size || { x: 2, y: 2 }
          const sizeB = this.chipMap?.[chipIdB]?.size || { x: 2, y: 2 }
          // Check overlap (bounding box)
          if (
            Math.abs(a.x - b.x) < (sizeA.x + sizeB.x) / 2 + minGap &&
            Math.abs(a.y - b.y) < (sizeA.y + sizeB.y) / 2 + minGap
          ) {
            // Nudge apart
            const dx = a.x - b.x
            const dy = a.y - b.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const push = ((sizeA.x + sizeB.x) / 2 + minGap - dist) / 2
            a.x += (dx / dist) * push
            b.x -= (dx / dist) * push
            a.y += (dy / dist) * push
            b.y -= (dy / dist) * push
            moved = true
          }
        }
      }
      iteration++
    } while (moved && iteration < maxIterations)

    this.outputLayout = {
      ...this.inputLayout,
      chipPlacements: placements,
    }
    this.solved = true
  }

  getOutputLayout(): OutputLayout | null {
    return this.outputLayout
  }
}
