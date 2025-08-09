/**
 * Finds pin ranges on each chip in the partition and matches layouts from the corpus.
 * Creates subset groups with pin ranges and finds pre-laid-out designs that match.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { InputProblem } from "../../types/InputProblem"
import {
  PartitionPinRangeMatchSolver,
  type PinRange,
} from "./PartitionPinRangeMatchSolver/PartitionPinRangeMatchSolver"

export class PinRangeMatchSolver extends BaseSolver {
  partitions: InputProblem[]
  currentPartitionIndex = 0
  activeSubSolver: PartitionPinRangeMatchSolver | null = null
  partitionResults: PinRange[][] = []

  constructor(partitions: InputProblem[]) {
    super()
    this.partitions = partitions
  }

  override _step() {
    if (this.currentPartitionIndex >= this.partitions.length) {
      this.solved = true
      return
    }

    // Create or progress the current partition's sub-solver
    if (!this.activeSubSolver) {
      const currentPartition = this.partitions[this.currentPartitionIndex]!
      this.activeSubSolver = new PartitionPinRangeMatchSolver(currentPartition)
    }

    if (!this.activeSubSolver.solved && !this.activeSubSolver.failed) {
      this.activeSubSolver.step()
      return
    }

    if (this.activeSubSolver.failed) {
      this.failed = true
      this.error = `Partition ${this.currentPartitionIndex} failed: ${this.activeSubSolver.error}`
      return
    }

    if (this.activeSubSolver.solved) {
      // Store the results
      this.partitionResults.push(this.activeSubSolver.pinRanges)

      // Move to next partition
      this.currentPartitionIndex++
      this.activeSubSolver = null
    }
  }

  getAllPinRanges(): PinRange[] {
    return this.partitionResults.flat()
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver && !this.activeSubSolver.solved) {
      return this.activeSubSolver.visualize()
    }

    // Show all completed results
    return {
      lines: [
        {
          points: [
            // draw points to indicate bounds
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 0, y: 0 },
          ],
        },
      ],
      points: this.getAllPinRanges().flatMap((range) =>
        range.pinIds.map(() => ({
          x: Math.random() * 10,
          y: Math.random() * 10,
          color: "green",
        })),
      ),
      rects: [],
      circles: [],
    }
  }

  override getConstructorParams() {
    return { partitions: this.partitions }
  }
}

// Re-export types and classes for convenience
export { PartitionPinRangeMatchSolver, type PinRange }
