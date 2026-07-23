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
import {
  DecouplingCapRowSolver,
  canLayoutDecouplingCapRow,
} from "./DecouplingCapRowSolver"
import {
  canLayoutCrystalCircuit,
  CrystalCircuitLayoutSolver,
} from "./CrystalCircuitLayoutSolver"
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
  | CrystalCircuitLayoutSolver
  | SingleInnerPartitionPackingSolver
  | ParallelAlignedPassiveSolver
  | DecouplingCapRowSolver

/**
 * A partition-layout strategy, modelled on LayoutPipelineSolver's PipelineStep: a
 * solver class plus a factory for its constructor params, guarded by `appliesTo`
 * so the solver can be chosen from partition contents. Strategies are tried in
 * order; the last one matches any partition (the generic packer), so new
 * partition solvers are added by inserting a strategy before it.
 */
type PartitionSolverStrategy<T extends new (...args: any[]) => BaseSolver> = {
  solverName: string
  solverClass: T
  appliesTo: (partition: PartitionInputProblem) => boolean
  getConstructorParams: (
    instance: PackInnerPartitionsSolver,
  ) => ConstructorParameters<T>
}

function definePartitionSolverStrategy<
  T extends new (
    ...args: any[]
  ) => BaseSolver,
  const P extends ConstructorParameters<T>,
>(
  solverName: string,
  solverClass: T,
  appliesTo: (partition: PartitionInputProblem) => boolean,
  getConstructorParams: (instance: PackInnerPartitionsSolver) => P,
): PartitionSolverStrategy<T> {
  return { solverName, solverClass, appliesTo, getConstructorParams }
}

const PARTITION_SOLVER_STRATEGIES = [
  definePartitionSolverStrategy(
    "crystalCircuitLayoutSolver",
    CrystalCircuitLayoutSolver,
    canLayoutCrystalCircuit,
    (instance) => [
      {
        partitionInputProblem: instance.partitions[
          instance.currentPartitionIndex
        ]! as PartitionInputProblem,
      },
    ],
  ),
  definePartitionSolverStrategy(
    "decouplingCapRowSolver",
    DecouplingCapRowSolver,
    canLayoutDecouplingCapRow,
    (instance) => [
      {
        partitionInputProblem: instance.partitions[
          instance.currentPartitionIndex
        ]! as PartitionInputProblem,
      },
    ],
  ),
  definePartitionSolverStrategy(
    "parallelAlignedPassiveSolver",
    ParallelAlignedPassiveSolver,
    (partition) => findSameSidePassiveGroups(partition).length > 0,
    (instance) => [
      {
        partitionInputProblem: instance.partitions[
          instance.currentPartitionIndex
        ]! as PartitionInputProblem,
        pinIdToStronglyConnectedPins: instance.pinIdToStronglyConnectedPins,
      },
    ],
  ),
  definePartitionSolverStrategy(
    "singleInnerPartitionPackingSolver",
    SingleInnerPartitionPackingSolver,
    () => true,
    (instance) => [
      {
        partitionInputProblem: instance.partitions[
          instance.currentPartitionIndex
        ]! as PartitionInputProblem,
        pinIdToStronglyConnectedPins: instance.pinIdToStronglyConnectedPins,
      },
    ],
  ),
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

    // If no active solver, create one for the current partition. The solver is
    // chosen from PARTITION_SOLVER_STRATEGIES by partition contents, the same way
    // LayoutPipelineSolver builds each phase from pipelineDef.
    if (!this.activeSolver) {
      const currentPartition = this.partitions[
        this.currentPartitionIndex
      ]! as PartitionInputProblem
      const strategy = PARTITION_SOLVER_STRATEGIES.find((s) =>
        s.appliesTo(currentPartition),
      )!
      const constructorParams = strategy.getConstructorParams(this)
      // @ts-ignore
      this.activeSolver = new strategy.solverClass(...constructorParams)
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
