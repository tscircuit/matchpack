/**
 * Packs the internal layout of each partition using SingleInnerPartitionPackingSolver.
 * This stage takes the partitions from ChipPartitionsSolver and creates optimized
 * internal layouts for each partition before they are packed together.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { ChipPin, InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { SingleInnerPartitionPackingSolver } from "./SingleInnerPartitionPackingSolver"
import { StarTopologyPackingSolver } from "../StarTopologyPackingSolver/StarTopologyPackingSolver"
import { stackGraphicsHorizontally } from "graphics-debug"

export type PackedPartition = {
  inputProblem: InputProblem
  layout: OutputLayout
}

export class PackInnerPartitionsSolver extends BaseSolver {
  partitions: InputProblem[]
  packedPartitions: PackedPartition[] = []
  completedSolvers: SingleInnerPartitionPackingSolver[] = []
  activeSolver: SingleInnerPartitionPackingSolver | null = null
  currentPartitionIndex = 0

  declare activeSubSolver: SingleInnerPartitionPackingSolver | null
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
      const currentPartition = this.partitions[this.currentPartitionIndex]!
      
      try {
        // Try to use the StarTopologyPackingSolver first for clean orthogonal alignments
        const starSolver = new StarTopologyPackingSolver({
          partitionInputProblem: currentPartition,
          pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
        })
        starSolver.step()
        if (starSolver.solved && !starSolver.failed) {
          this.activeSolver = starSolver as any // Use the star solver as fully solved immediately
          this.activeSubSolver = null
        } else {
          throw new Error("Star solver did not solve cleanly")
        }
      } catch (e: any) {
        // Fallback to the generic iterative packing solver
        this.activeSolver = new SingleInnerPartitionPackingSolver({
          partitionInputProblem: currentPartition,
          pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
        }) as any
        this.activeSubSolver = this.activeSolver as any
      }
    }

    // Step the active solver
    if (this.activeSubSolver) {
      this.activeSubSolver.step()
    }

    if (this.activeSolver!.failed) {
      this.failed = true
      this.error = `Partition ${this.currentPartitionIndex} failed: ${this.activeSolver!.error}`
      return
    }

    if (this.activeSolver!.solved) {
      // Store the completed solver and its results
      this.completedSolvers.push(this.activeSolver! as any)

      if (this.activeSolver!.layout) {
        this.packedPartitions.push({
          inputProblem: this.partitions[this.currentPartitionIndex]!,
          layout: this.activeSolver!.layout,
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
      return super.visualize()
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
