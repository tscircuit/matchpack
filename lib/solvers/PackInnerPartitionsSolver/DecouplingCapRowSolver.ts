/**
 * Place decoupling caps across their pin axis so their shared rails stay straight.
 * Body extents preserve label spacing, and chipMap order preserves pin order.
 * Compatible fixed caps anchor the entire row; incompatible anchors use the
 * general packing fallback instead of silently moving a caller constraint.
 */
import type { GraphicsObject } from "graphics-debug"
import type { PartitionInputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { getDecouplingCapRowLayout } from "./getDecouplingCapRowLayout"

export const canLayoutDecouplingCapRow = (
  partition: PartitionInputProblem,
): boolean => getDecouplingCapRowLayout(partition) !== null

export class DecouplingCapRowSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null

  constructor(params: { partitionInputProblem: PartitionInputProblem }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
  }

  override _step() {
    this.layout = getDecouplingCapRowLayout(this.partitionInputProblem)
    if (!this.layout) {
      this.failed = true
      this.error = "Decoupling caps do not form a compatible rail row"
      return
    }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.partitionInputProblem,
      this.layout ?? { chipPlacements: {}, groupPlacements: {} },
    )
  }

  override getConstructorParams(): [
    { partitionInputProblem: PartitionInputProblem },
  ] {
    return [{ partitionInputProblem: this.partitionInputProblem }]
  }
}
