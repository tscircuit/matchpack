/**
 * Packs the internal layout of each partition.
 *
 * - Decoupling-cap partitions use the specialized DecouplingCapsPackingSolver
 *   (clean horizontal row layout).
 * - All other partitions use the generic SingleInnerPartitionPackingSolver.
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
import { DecouplingCapsPackingSolver } from "./DecouplingCapsPackingSolver"
import { stackGraphicsHorizontally } from "graphics-debug"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export type PackedPartition = {
  inputProblem: InputProblem
  layout: OutputLayout
}

type PartitionSolver =
  | SingleInnerPartitionPackingSolver
  | DecouplingCapsPackingSolver

export class PackInnerPartitionsSolver extends BaseSolver {
  partitions: InputProblem[]
  packedPartitions: PackedPartition[] = []
  completedSolvers: PartitionSolver[] = []
  activeSolver: PartitionSolver | null = null
  currentPartitionIndex = 0

  declare activeSubSolver: PartitionSolver | null
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

    // If no active solver, create one for the current partition
    if (!this.activeSolver) {
      const currentPartition = this.partitions[
        this.currentPartitionIndex
      ]! as PartitionInputProblem

      if (currentPartition.partitionType === "decoupling_caps") {
        // Use the specialized row-layout solver for decoupling cap partitions
        this.activeSolver = new DecouplingCapsPackingSolver(currentPartition)
      } else {
        this.activeSolver = new SingleInnerPartitionPackingSolver({
          partitionInputProblem: currentPartition,
          pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
        })
      }
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
