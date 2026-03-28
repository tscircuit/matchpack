/**
 * Specialized solver for packing decoupling capacitor partitions.
 *
 * Instead of the generic PackSolver2 packing algorithm, this solver arranges
 * decoupling capacitors in a clean horizontal row (matching the "official layout"
 * style from the issue). Caps are placed side-by-side from left to right with a
 * consistent gap, all at rotation 0 so their y+ / y- pins align vertically for
 * clean power/ground routing.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { PartitionInputProblem } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

export class DecouplingCapsPackingSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null

  constructor(partitionInputProblem: PartitionInputProblem) {
    super()
    this.partitionInputProblem = partitionInputProblem
  }

  override _step() {
    this.layout = this.computeRowLayout()
    this.solved = true
  }

  /**
   * Arranges all caps in the partition in a horizontal row, left to right,
   * each at rotation 0. This keeps the y+ / y- pins (VCC / GND) aligned along
   * the same horizontal rail for clean routing to the nearby chip power pins.
   */
  private computeRowLayout(): OutputLayout {
    const chips = Object.values(this.partitionInputProblem.chipMap)
    const gap =
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap

    // Sort chips by their ID for a deterministic ordering
    const sortedChips = [...chips].sort((a, b) =>
      a.chipId.localeCompare(b.chipId),
    )

    const chipPlacements: Record<string, Placement> = {}

    // Lay out caps in a row, centering the entire row at x = 0
    // First pass: compute total width
    let totalWidth = 0
    for (let i = 0; i < sortedChips.length; i++) {
      totalWidth += sortedChips[i]!.size.x
      if (i < sortedChips.length - 1) {
        totalWidth += gap
      }
    }

    // Second pass: assign positions
    let cursor = -totalWidth / 2
    for (const chip of sortedChips) {
      const halfW = chip.size.x / 2
      chipPlacements[chip.chipId] = {
        x: cursor + halfW,
        y: 0,
        ccwRotationDegrees: 0,
      }
      cursor += chip.size.x + gap
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (!this.layout) {
      const basicLayout = doBasicInputProblemLayout(this.partitionInputProblem)
      return visualizeInputProblem(this.partitionInputProblem, basicLayout)
    }
    return visualizeInputProblem(this.partitionInputProblem, this.layout)
  }

  override getConstructorParams(): [PartitionInputProblem] {
    return [this.partitionInputProblem]
  }
}
