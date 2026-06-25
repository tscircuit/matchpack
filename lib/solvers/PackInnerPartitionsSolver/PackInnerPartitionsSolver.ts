/**
 * Packs the internal layout of each partition. This stage takes the partitions
 * from ChipPartitionsSolver and creates optimized internal layouts for each
 * partition before they are packed together. Each partition is routed to a
 * layout solver chosen by its contents (see PARTITION_SOLVER_STRATEGIES),
 * defaulting to SingleInnerPartitionPackingSolver.
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
import { ParallelAlignedPassiveSolver } from "./ParallelAlignedPassiveSolver"
import { findSameSidePassiveGroups } from "./findSameSidePassiveGroups"
import { stackGraphicsHorizontally } from "graphics-debug"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export type PackedPartition = {
  inputProblem: InputProblem
  layout: OutputLayout
}

/** Every inner-partition layout solver exposes a `.layout` result. */
type InnerPartitionSolver =
  | SingleInnerPartitionPackingSolver
  | ParallelAlignedPassiveSolver

interface InnerPartitionSolverParams {
  partitionInputProblem: PartitionInputProblem
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
}

/**
 * A partition-layout strategy: a predicate deciding whether it should handle a
 * partition, plus the solver class to build for it. Strategies are tried in
 * order; a partition matched by none falls back to the generic packer. To add a
 * new partition solver, append an entry here — no other dispatch code changes.
 */
interface PartitionSolverStrategy {
  name: string
  appliesTo: (partition: PartitionInputProblem) => boolean
  Solver: new (params: InnerPartitionSolverParams) => InnerPartitionSolver
}

const PARTITION_SOLVER_STRATEGIES: PartitionSolverStrategy[] = [
  {
    name: "parallel_aligned_passives",
    appliesTo: (partition) => findSameSidePassiveGroups(partition).length > 0,
    Solver: ParallelAlignedPassiveSolver,
  },
]

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
    // solver is chosen by partition contents via the strategy registry.
    if (!this.activeSolver) {
      const currentPartition = this.partitions[
        this.currentPartitionIndex
      ]! as PartitionInputProblem
      this.activeSolver = this.createSolverForPartition(currentPartition)
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

  /**
   * Pick the layout solver for a partition: the first registered strategy whose
   * predicate matches, otherwise the generic SingleInnerPartitionPackingSolver.
   */
  private createSolverForPartition(
    partition: PartitionInputProblem,
  ): InnerPartitionSolver {
    const params: InnerPartitionSolverParams = {
      partitionInputProblem: partition,
      pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
    }
    for (const strategy of PARTITION_SOLVER_STRATEGIES) {
      if (strategy.appliesTo(partition)) return new strategy.Solver(params)
    }
    return new SingleInnerPartitionPackingSolver(params)
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
