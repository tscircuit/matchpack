/**
 * Packs the internal layout of each partition using SingleInnerPartitionPackingSolver.
 * This stage takes the partitions from ChipPartitionsSolver and creates optimized
 * internal layouts for each partition before they are packed together.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type {
  ChipPin,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { SingleInnerPartitionPackingSolver } from "./SingleInnerPartitionPackingSolver"
import { ChipPassivesLayoutSolver } from "./ChipPassivesLayoutSolver"
import { findSameSidePassiveGroups } from "./findSameSidePassiveGroups"
import { stackGraphicsHorizontally } from "graphics-debug"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export type PackedPartition = {
  inputProblem: InputProblem
  layout: OutputLayout
}

/** Both inner-partition layout strategies expose a `.layout` result. */
type InnerPartitionSolver =
  | SingleInnerPartitionPackingSolver
  | ChipPassivesLayoutSolver

export class PackInnerPartitionsSolver extends BaseSolver {
  partitions: InputProblem[]
  packedPartitions: PackedPartition[] = []
  completedSolvers: InnerPartitionSolver[] = []
  activeSolver: InnerPartitionSolver | null = null
  currentPartitionIndex = 0

  declare activeSubSolver: InnerPartitionSolver | null
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>

  constructor(params: {
    partitions: InputProblem[]
    pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  }) {
    super()
    this.partitions = params.partitions
    this.pinIdToStronglyConnectedPins = params.pinIdToStronglyConnectedPins
  }

  override _step() {
    // If we've processed all partitions, we're done
    if (this.currentPartitionIndex >= this.partitions.length) {
      this.solved = true
      return
    }

    // If no active solver, create one for the current partition. The layout
    // algorithm is chosen by partition contents: a chip surrounded by a group of
    // same-side passives uses the structure-aware ChipPassivesLayoutSolver,
    // everything else uses the generic packer.
    if (!this.activeSolver) {
      const currentPartition = this.partitions[
        this.currentPartitionIndex
      ]! as PartitionInputProblem
      const hasPassiveGroup =
        findSameSidePassiveGroups(currentPartition).length > 0
      this.activeSolver = hasPassiveGroup
        ? new ChipPassivesLayoutSolver({
            partitionInputProblem: currentPartition,
            pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
          })
        : new SingleInnerPartitionPackingSolver({
            partitionInputProblem: currentPartition,
            pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
          })
      this.activeSubSolver = this.activeSolver
    }

    // Step the active solver
    this.activeSolver.step()

    if (this.activeSolver.failed) {
      this.failed = true
      this.error = `Partition ${this.currentPartitionIndex} failed: ${this.activeSolver.error}`
      return
    }

    if (this.activeSolver.solved) {
      // Store the completed solver and its results
      this.completedSolvers.push(this.activeSolver)

      if (this.activeSolver.layout) {
        this.packedPartitions.push({
          inputProblem: this.partitions[this.currentPartitionIndex]!,
          layout: this.activeSolver.layout,
        })
      } else {
        this.failed = true
        this.error = `Partition ${this.currentPartitionIndex} completed but has no layout`
        return
      }

      // Move to next partition
      this.activeSolver = null
      this.activeSubSolver = null
      this.currentPartitionIndex++
    }
  }

  override visualize(): GraphicsObject {
    if (this.activeSolver) {
      return this.activeSolver.visualize()
    }

    if (this.completedSolvers.length === 0) {
      const partitionVisualizations = this.partitions.map((partition) => {
        const layout = doBasicInputProblemLayout(partition)
        return visualizeInputProblem(partition, layout)
      })
      const titles = this.partitions.map((_, index) => `partition${index}`)

      return stackGraphicsHorizontally(partitionVisualizations, { titles })
    }

    // Show all completed partition visualizations
    const partitionVisualizations = this.completedSolvers.map((solver) =>
      solver.visualize(),
    )

    const titles = this.completedSolvers.map(
      (_, index) => `packed_partition_${index}`,
    )

    return stackGraphicsHorizontally(partitionVisualizations, { titles })
  }

  override getConstructorParams(): [InputProblem[]] {
    return [this.partitions]
  }
}
