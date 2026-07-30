/**
 * Inner-partition solver for an even series path that leaves and returns to two
 * pins on the same side of a main chip. It starts with the generic packed layout
 * and then folds the path into two parallel branches when that refinement can
 * preserve the requested component clearance.
 */

import type { GraphicsObject } from "graphics-debug"
import type {
  ChipId,
  ChipPin,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { findParallelSeriesBranchGroups } from "./findParallelSeriesBranchGroups"
import { layoutParallelSeriesBranchGroup } from "./layoutParallelSeriesBranchGroup"
import { SingleInnerPartitionPackingSolver } from "./SingleInnerPartitionPackingSolver"

export const canLayoutParallelSeriesBranches = (
  partition: PartitionInputProblem,
): boolean => findParallelSeriesBranchGroups(partition).length > 0

export class ParallelSeriesBranchSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  declare activeSubSolver: SingleInnerPartitionPackingSolver | null

  private packingSolver: SingleInnerPartitionPackingSolver | null = null

  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.pinIdToStronglyConnectedPins = params.pinIdToStronglyConnectedPins
  }

  override _step() {
    if (!this.packingSolver) {
      this.packingSolver = new SingleInnerPartitionPackingSolver({
        partitionInputProblem: this.partitionInputProblem,
        pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
      })
      this.activeSubSolver = this.packingSolver
    }

    this.packingSolver.step()

    if (this.packingSolver.failed) {
      this.failed = true
      this.error = this.packingSolver.error
      return
    }

    if (this.packingSolver.solved && this.packingSolver.layout) {
      this.layout = this.refinePackedLayout(this.packingSolver.layout)
      this.activeSubSolver = null
      this.solved = true
    }
  }

  private refinePackedLayout(baseLayout: OutputLayout): OutputLayout {
    const chipPlacements: Record<ChipId, Placement> = {}
    for (const [chipId, placement] of Object.entries(
      baseLayout.chipPlacements,
    )) {
      chipPlacements[chipId] = { ...placement }
    }

    for (const group of findParallelSeriesBranchGroups(
      this.partitionInputProblem,
    )) {
      const candidatePlacements = layoutParallelSeriesBranchGroup({
        group,
        chipPlacements,
        inputProblem: this.partitionInputProblem,
      })
      if (candidatePlacements) {
        Object.assign(chipPlacements, candidatePlacements)
      }
    }

    return {
      chipPlacements,
      groupPlacements: baseLayout.groupPlacements,
    }
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver && !this.solved) {
      return this.activeSubSolver.visualize()
    }
    if (!this.layout) {
      const basicLayout = doBasicInputProblemLayout(this.partitionInputProblem)
      return visualizeInputProblem(this.partitionInputProblem, basicLayout)
    }
    return visualizeInputProblem(this.partitionInputProblem, this.layout)
  }

  override getConstructorParams(): [InputProblem] {
    return [this.partitionInputProblem]
  }
}
