import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"

export interface OverlapResolutionSolverInput {
  inputProblem: InputProblem
  initialLayout: OutputLayout
  maxIterations?: number
}

type Bounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export class OverlapResolutionSolver extends BaseSolver {
  inputProblem: InputProblem
  resolvedLayout: OutputLayout
  maxIterations: number

  constructor(input: OverlapResolutionSolverInput) {
    super()
    this.inputProblem = input.inputProblem
    this.resolvedLayout = {
      chipPlacements: Object.fromEntries(
        Object.entries(input.initialLayout.chipPlacements).map(
          ([chipId, placement]) => [chipId, { ...placement }],
        ),
      ),
      groupPlacements: { ...input.initialLayout.groupPlacements },
    }
    this.maxIterations = input.maxIterations ?? 150
    this.MAX_ITERATIONS = this.maxIterations
  }

  override _step() {
    const chipIds = Object.keys(this.resolvedLayout.chipPlacements)
    if (chipIds.length <= 1) {
      this.solved = true
      return
    }

    const displacement: Record<string, { x: number; y: number }> = {}
    for (const chipId of chipIds) {
      displacement[chipId] = { x: 0, y: 0 }
    }

    let overlapsFound = 0
    const minGap = Math.max(this.inputProblem.chipGap ?? 0, 0)
    const epsilon = 1e-6

    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const chipA = chipIds[i]!
        const chipB = chipIds[j]!
        const boundsA = this.getChipBounds(chipA, minGap / 2)
        const boundsB = this.getChipBounds(chipB, minGap / 2)

        const overlapX =
          Math.min(boundsA.maxX, boundsB.maxX) -
          Math.max(boundsA.minX, boundsB.minX)
        const overlapY =
          Math.min(boundsA.maxY, boundsB.maxY) -
          Math.max(boundsA.minY, boundsB.minY)

        if (overlapX <= 0 || overlapY <= 0) {
          continue
        }

        overlapsFound++
        const placementA = this.resolvedLayout.chipPlacements[chipA]!
        const placementB = this.resolvedLayout.chipPlacements[chipB]!

        if (overlapX < overlapY) {
          const direction =
            placementA.x === placementB.x
              ? chipA < chipB
                ? -1
                : 1
              : placementA.x < placementB.x
                ? -1
                : 1
          const push = (overlapX + epsilon) / 2
          displacement[chipA]!.x += direction * push
          displacement[chipB]!.x -= direction * push
        } else {
          const direction =
            placementA.y === placementB.y
              ? chipA < chipB
                ? -1
                : 1
              : placementA.y < placementB.y
                ? -1
                : 1
          const push = (overlapY + epsilon) / 2
          displacement[chipA]!.y += direction * push
          displacement[chipB]!.y -= direction * push
        }
      }
    }

    let maxMovement = 0
    const damping = 0.85
    for (const chipId of chipIds) {
      const delta = displacement[chipId]!
      const stepX = delta.x * damping
      const stepY = delta.y * damping
      const placement = this.resolvedLayout.chipPlacements[chipId]!
      placement.x += stepX
      placement.y += stepY
      maxMovement = Math.max(maxMovement, Math.hypot(stepX, stepY))
    }

    if (overlapsFound === 0 || maxMovement < 1e-6) {
      this.recenterLayout()
      this.solved = true
    }
  }

  private getChipBounds(chipId: string, inflation = 0): Bounds {
    const placement = this.resolvedLayout.chipPlacements[chipId]!
    const chip = this.inputProblem.chipMap[chipId]!
    const rotation = ((placement.ccwRotationDegrees % 360) + 360) % 360
    const isVertical = rotation === 90 || rotation === 270
    const width = isVertical ? chip.size.y : chip.size.x
    const height = isVertical ? chip.size.x : chip.size.y
    const halfWidth = width / 2 + inflation
    const halfHeight = height / 2 + inflation

    return {
      minX: placement.x - halfWidth,
      maxX: placement.x + halfWidth,
      minY: placement.y - halfHeight,
      maxY: placement.y + halfHeight,
    }
  }

  private recenterLayout() {
    const placements = Object.values(this.resolvedLayout.chipPlacements)
    if (placements.length === 0) return
    const centerX =
      placements.reduce((sum, placement) => sum + placement.x, 0) /
      placements.length
    const centerY =
      placements.reduce((sum, placement) => sum + placement.y, 0) /
      placements.length

    for (const placement of placements) {
      placement.x -= centerX
      placement.y -= centerY
    }
  }

  override getConstructorParams(): OverlapResolutionSolverInput {
    return {
      inputProblem: this.inputProblem,
      initialLayout: this.resolvedLayout,
      maxIterations: this.maxIterations,
    }
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(this.inputProblem, this.resolvedLayout)
  }

  override preview(): GraphicsObject {
    return this.visualize()
  }
}
