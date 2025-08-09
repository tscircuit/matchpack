/**
 * Applies the matched layout to the pin ranges.
 * Moves passives that are connected to each pin range according to the matched design.
 */

import type { GraphicsObject } from "graphics-debug"
import { stackGraphicsHorizontally } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { PinRange } from "../PinRangeMatchSolver/PartitionPinRangeMatchSolver/PartitionPinRangeMatchSolver"
import type { InputProblem } from "../../types/InputProblem"
import { SinglePinRangeLayoutSolver } from "./SinglePinRangeLayoutSolver"

export class PinRangeLayoutSolver extends BaseSolver {
  pinRanges: PinRange[]
  inputProblems: InputProblem[]
  currentRangeIndex = 0
  activeSolver: SinglePinRangeLayoutSolver | null = null
  completedSolvers: SinglePinRangeLayoutSolver[] = []

  constructor(pinRanges: PinRange[], inputProblems: InputProblem[]) {
    super()
    this.pinRanges = pinRanges
    this.inputProblems = inputProblems
  }

  override _step() {
    if (this.currentRangeIndex >= this.pinRanges.length) {
      this.solved = true
      return
    }

    // Create or progress the current pin range solver
    if (!this.activeSolver) {
      const currentRange = this.pinRanges[this.currentRangeIndex]!
      // Find the appropriate input problem for this range
      const inputProblem = this.findInputProblemForRange(currentRange)

      if (!inputProblem) {
        this.failed = true
        this.error = `Could not find input problem for range ${this.currentRangeIndex}`
        return
      }

      this.activeSolver = new SinglePinRangeLayoutSolver(
        currentRange,
        inputProblem,
      )
    }

    if (!this.activeSolver.solved && !this.activeSolver.failed) {
      this.activeSolver.step()
      return
    }

    if (this.activeSolver.failed) {
      this.failed = true
      this.error = `Pin range ${this.currentRangeIndex} failed: ${this.activeSolver.error}`
      return
    }

    if (this.activeSolver.solved) {
      // Store the completed solver for visualization
      this.completedSolvers.push(this.activeSolver)

      // Move to next range
      this.currentRangeIndex++
      this.activeSolver = null
    }
  }

  private findInputProblemForRange(range: PinRange): InputProblem | null {
    // Find which input problem contains the pins from this range
    for (const inputProblem of this.inputProblems) {
      const hasAllPins = range.pinIds.every(
        (pinId) =>
          inputProblem.chipPinMap[pinId] || inputProblem.groupPinMap[pinId],
      )
      if (hasAllPins) {
        return inputProblem
      }
    }
    return null
  }

  override visualize(): GraphicsObject {
    if (this.completedSolvers.length === 0 && !this.activeSolver) {
      return super.visualize()
    }

    const visualizations: GraphicsObject[] = []
    const titles: string[] = []

    // Add completed solvers
    for (let i = 0; i < this.completedSolvers.length; i++) {
      const solver = this.completedSolvers[i]!
      visualizations.push(solver.visualize())
      titles.push(`Range ${i} (${solver.pinRange.side})`)
    }

    // Add active solver if it exists
    if (this.activeSolver) {
      visualizations.push(this.activeSolver.visualize())
      titles.push(
        `Range ${this.currentRangeIndex} (${this.activeSolver.pinRange.side}) - Active`,
      )
    }

    if (visualizations.length === 0) {
      return super.visualize()
    }

    return stackGraphicsHorizontally(visualizations, { titles })
  }

  override getConstructorParams() {
    return { pinRanges: this.pinRanges, inputProblems: this.inputProblems }
  }
}

// Re-export for convenience
export { SinglePinRangeLayoutSolver }
