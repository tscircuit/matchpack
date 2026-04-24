/**
 * Specialized solver that arranges decoupling capacitors in a clean horizontal
 * row, sorted deterministically by chipId.
 *
 * This bypasses the general PackSolver2 for decoupling_caps partitions,
 * producing the tidy "cap row next to IC" layout shown in the issue's
 * "acceptable solution" screenshot.
 */

import { BaseSolver } from "../BaseSolver"
import type { GraphicsObject } from "graphics-debug"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { PartitionInputProblem } from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export class DecouplingCapsPackingSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null

  constructor(params: { partitionInputProblem: PartitionInputProblem }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
  }

  override _step() {
    const { chipMap, chipGap, decouplingCapsGap } = this.partitionInputProblem
    const gap = decouplingCapsGap ?? chipGap

    // Sort chips by chipId for a deterministic, reproducible layout
    const chips = Object.values(chipMap).sort((a, b) =>
      a.chipId.localeCompare(b.chipId, undefined, { numeric: true }),
    )

    if (chips.length === 0) {
      this.layout = { chipPlacements: {}, groupPlacements: {} }
      this.solved = true
      return
    }

    // Compute total row width to centre it at x = 0
    const totalWidth = chips.reduce(
      (sum, chip, idx) =>
        sum + chip.size.x + (idx < chips.length - 1 ? gap : 0),
      0,
    )
    let x = -totalWidth / 2

    const chipPlacements: Record<string, Placement> = {}
    for (const chip of chips) {
      x += chip.size.x / 2
      chipPlacements[chip.chipId] = {
        x,
        y: 0,
        ccwRotationDegrees: 0,
      }
      x += chip.size.x / 2 + gap
    }

    this.layout = { chipPlacements, groupPlacements: {} }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    if (!this.layout) {
      return super.visualize()
    }
    return visualizeInputProblem(this.partitionInputProblem, this.layout)
  }

  override getConstructorParams(): [PartitionInputProblem] {
    return [this.partitionInputProblem]
  }
}
