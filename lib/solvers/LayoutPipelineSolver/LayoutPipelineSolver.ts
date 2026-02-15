/**
 * @file LayoutPipelineSolver.ts
 * @description Orchestrates the schematic layout process by executing a sequence of specialized solvers.
 * This pipeline handles everything from decoupling capacitor identification to final component packing.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { IdentifyDecouplingCapsSolver } from "lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import {
  PackInnerPartitionsSolver,
  type PackedPartition,
} from "lib/solvers/PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import { PartitionPackingSolver } from "lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import type { ChipPin, InputProblem, PinId } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"

/** * PROFESSIONAL REFACTOR: Import the centralized MatchResult type.
 * Using "import type" to comply with verbatimModuleSyntax.
 */
import type { MatchResult } from "lib/types"

import { doBasicInputProblemLayout } from "./doBasicInputProblemLayout"
import { visualizeInputProblem } from "./visualizeInputProblem"
import { getPinIdToStronglyConnectedPinsObj } from "./getPinIdToStronglyConnectedPinsObj"

/**
 * Definition structure for an individual step within the layout pipeline.
 */
type PipelineStep<T extends new (...args: any[]) => BaseSolver> = {
  solverName: string
  solverClass: T
  getConstructorParams: (
    instance: LayoutPipelineSolver,
  ) => ConstructorParameters<T>
  onSolved?: (instance: LayoutPipelineSolver) => void
}

/**
 * Helper function to define pipeline steps with type safety for constructor parameters.
 */
function definePipelineStep<
  T extends new (
    ...args: any[]
  ) => BaseSolver,
  const P extends ConstructorParameters<T>,
>(
  solverName: keyof LayoutPipelineSolver,
  solverClass: T,
  getConstructorParams: (instance: LayoutPipelineSolver) => P,
  opts: {
    onSolved?: (instance: LayoutPipelineSolver) => void
  } = {},
): PipelineStep<T> {
  return {
    solverName,
    solverClass,
    getConstructorParams,
    onSolved: opts.onSolved,
  }
}

export class LayoutPipelineSolver extends BaseSolver {
  // Solver instances for different phases of the layout
  identifyDecouplingCapsSolver?: IdentifyDecouplingCapsSolver
  chipPartitionsSolver?: ChipPartitionsSolver
  packInnerPartitionsSolver?: PackInnerPartitionsSolver
  partitionPackingSolver?: PartitionPackingSolver

  // Performance tracking and metadata for each pipeline phase
  startTimeOfPhase: Record<string, number>
  endTimeOfPhase: Record<string, number>
  timeSpentOnPhase: Record<string, number>
  firstIterationOfPhase: Record<string, number>

  // Computed utilities for connectivity analysis
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>

  inputProblem: InputProblem
  chipPartitions?: ChipPartitionsSolver["partitions"]
  packedPartitions?: PackedPartition[]

  /**
   * Defines the sequential execution order of solvers.
   */
  pipelineDef = [
    definePipelineStep(
      "identifyDecouplingCapsSolver",
      IdentifyDecouplingCapsSolver,
      () => [this.inputProblem],
      {
        onSolved: (_layoutSolver) => {
          // Logic to execute once decoupling caps are grouped
        },
      },
    ),
    definePipelineStep(
      "chipPartitionsSolver",
      ChipPartitionsSolver,
      () => [
        {
          inputProblem: this.inputProblem,
          decouplingCapGroups:
            this.identifyDecouplingCapsSolver?.outputDecouplingCapGroups,
        },
      ],
      {
        onSolved: (_layoutSolver) => {
          this.chipPartitions = this.chipPartitionsSolver!.partitions
        },
      },
    ),
    definePipelineStep(
      "packInnerPartitionsSolver",
      PackInnerPartitionsSolver,
      () => [
        {
          partitions: this.chipPartitions!,
          pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
        },
      ],
      {
        onSolved: (_solver) => {
          this.packedPartitions =
            this.packInnerPartitionsSolver!.packedPartitions
        },
      },
    ),
    definePipelineStep(
      "partitionPackingSolver",
      PartitionPackingSolver,
      () => [
        {
          packedPartitions: this.packedPartitions || [],
          inputProblem: this.inputProblem,
        },
      ],
      {
        onSolved: (_solver) => {
          // Final layout data is now populated
        },
      },
    ),
  ]

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
    this.MAX_ITERATIONS = 1e6
    this.startTimeOfPhase = {}
    this.endTimeOfPhase = {}
    this.timeSpentOnPhase = {}
    this.firstIterationOfPhase = {}
    this.pinIdToStronglyConnectedPins =
      getPinIdToStronglyConnectedPinsObj(inputProblem)
  }

  currentPipelineStepIndex = 0

  /**
   * Executes a single step of the current active solver or transitions to the next phase.
   */
  override _step() {
    const pipelineStepDef = this.pipelineDef[this.currentPipelineStepIndex]
    if (!pipelineStepDef) {
      this.solved = true
      return
    }

    if (this.activeSubSolver) {
      this.activeSubSolver.step()
      if (this.activeSubSolver.solved) {
        this.endTimeOfPhase[pipelineStepDef.solverName] = performance.now()
        this.timeSpentOnPhase[pipelineStepDef.solverName] =
          this.endTimeOfPhase[pipelineStepDef.solverName]! -
          this.startTimeOfPhase[pipelineStepDef.solverName]!
        pipelineStepDef.onSolved?.(this)
        this.activeSubSolver = null
        this.currentPipelineStepIndex++
      } else if (this.activeSubSolver.failed) {
        this.error = this.activeSubSolver?.error
        this.failed = true
        this.activeSubSolver = null
      }
      return
    }

    // Initialize the next solver in the pipeline
    const constructorParams = pipelineStepDef.getConstructorParams(this)
    // @ts-ignore - Dynamic class instantiation
    this.activeSubSolver = new pipelineStepDef.solverClass(...constructorParams)
    ;(this as any)[pipelineStepDef.solverName] = this.activeSubSolver
    this.timeSpentOnPhase[pipelineStepDef.solverName] = 0
    this.startTimeOfPhase[pipelineStepDef.solverName] = performance.now()
    this.firstIterationOfPhase[pipelineStepDef.solverName] = this.iterations
  }

  /**
   * Synchronously advances the pipeline until a specific phase is reached.
   */
  solveUntilPhase(phase: string) {
    while (this.getCurrentPhase() !== phase) {
      this.step()
    }
  }

  /**
   * Returns the name of the currently active pipeline phase.
   */
  getCurrentPhase(): string {
    return this.pipelineDef[this.currentPipelineStepIndex]?.solverName ?? "none"
  }

  /**
   * Generates a graphical representation of the current solving state.
   */
  override visualize(): GraphicsObject {
    if (!this.solved && this.activeSubSolver)
      return this.activeSubSolver.visualize()

    // Priority: Display final chip placements once packing is complete
    if (this.solved && this.partitionPackingSolver?.solved) {
      return this.partitionPackingSolver.visualize()
    }

    const identifyDecouplingCapsViz =
      this.identifyDecouplingCapsSolver?.visualize()
    const chipPartitionsViz = this.chipPartitionsSolver?.visualize()
    const packInnerPartitionsViz = this.packInnerPartitionsSolver?.visualize()
    const partitionPackingViz = this.partitionPackingSolver?.visualize()

    // Fallback to basic layout to prevent overlapping at origin
    const basicLayout = doBasicInputProblemLayout(this.inputProblem)
    const inputViz = visualizeInputProblem(this.inputProblem, basicLayout)

    const visualizations = [
      inputViz,
      identifyDecouplingCapsViz,
      chipPartitionsViz,
      packInnerPartitionsViz,
      partitionPackingViz,
    ]
      .filter(Boolean)
      .map((viz, stepIndex) => {
        // Tag graphical elements with their respective pipeline step
        for (const rect of viz!.rects ?? []) rect.step = stepIndex
        for (const point of viz!.points ?? []) point.step = stepIndex
        for (const circle of viz!.circles ?? []) circle.step = stepIndex
        for (const text of viz!.texts ?? []) text.step = stepIndex
        for (const line of viz!.lines ?? []) line.step = stepIndex
        return viz
      }) as GraphicsObject[]

    if (visualizations.length === 1) return visualizations[0]!

    // Merge all graphical data into a single output object
    return {
      points: visualizations.flatMap((v) => v.points || []),
      rects: visualizations.flatMap((v) => v.rects || []),
      lines: visualizations.flatMap((v) => v.lines || []),
      circles: visualizations.flatMap((v) => v.circles || []),
      texts: visualizations.flatMap((v) => v.texts || []),
    }
  }

  /**
   * Provides a lightweight graphical preview for real-time progress streaming.
   */
  override preview(): GraphicsObject {
    if (this.activeSubSolver) {
      return this.activeSubSolver.preview()
    }

    // Attempt to show visualization from the most advanced completed solver
    return (
      this.partitionPackingSolver?.visualize() ??
      this.packInnerPartitionsSolver?.visualize() ??
      this.chipPartitionsSolver?.visualize() ??
      this.identifyDecouplingCapsSolver?.visualize() ??
      super.preview()
    )
  }

  /**
   * Detects overlaps between chips in a given layout, accounting for rotation.
   * Returns a detailed list of overlapping pairs and the affected area.
   */
  checkForOverlaps(layout: OutputLayout): Array<{
    chip1: string
    chip2: string
    overlapArea: number
  }> {
    const overlaps: Array<{
      chip1: string
      chip2: string
      overlapArea: number
    }> = []

    const chipIds = Object.keys(layout.chipPlacements)

    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const chip1Id = chipIds[i]!
        const chip2Id = chipIds[j]!
        const placement1 = layout.chipPlacements[chip1Id]!
        const placement2 = layout.chipPlacements[chip2Id]!

        const chip1 = this.inputProblem.chipMap[chip1Id]
        const chip2 = this.inputProblem.chipMap[chip2Id]

        if (!chip1 || !chip2) continue

        // Determine AABB for rotated chips
        const bounds1 = this.getRotatedBounds(placement1, chip1.size)
        const bounds2 = this.getRotatedBounds(placement2, chip2.size)

        const overlapArea = this.calculateOverlapArea(bounds1, bounds2)

        if (overlapArea > 0) {
          overlaps.push({ chip1: chip1Id, chip2: chip2Id, overlapArea })
        }
      }
    }

    return overlaps
  }

  /**
   * Calculates the Axis-Aligned Bounding Box (AABB) for a rotated component.
   */
  private getRotatedBounds(
    placement: { x: number; y: number; ccwRotationDegrees: number },
    size: { x: number; y: number },
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    const halfWidth = size.x / 2
    const halfHeight = size.y / 2

    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))

    const rotatedWidth = halfWidth * cos + halfHeight * sin
    const rotatedHeight = halfWidth * sin + halfHeight * cos

    return {
      minX: placement.x - rotatedWidth,
      maxX: placement.x + rotatedWidth,
      minY: placement.y - rotatedHeight,
      maxY: placement.y + rotatedHeight,
    }
  }

  /**
   * Calculates the intersection area between two AABBs.
   */
  private calculateOverlapArea(
    bounds1: { minX: number; maxX: number; minY: number; maxY: number },
    bounds2: { minX: number; maxX: number; minY: number; maxY: number },
  ): number {
    if (
      bounds1.maxX <= bounds2.minX ||
      bounds1.minX >= bounds2.maxX ||
      bounds1.maxY <= bounds2.minY ||
      bounds1.minY >= bounds2.maxY
    ) {
      return 0
    }

    const overlapWidth =
      Math.min(bounds1.maxX, bounds2.maxX) -
      Math.max(bounds1.minX, bounds2.minX)
    const overlapHeight =
      Math.min(bounds1.maxY, bounds2.maxY) -
      Math.max(bounds1.minY, bounds2.minY)

    return overlapWidth * overlapHeight
  }

  /**
   * Retrieves the final layout result. Throws an error if solve process is incomplete.
   * Performs a validation check for chip overlaps.
   */
  getOutputLayout(): OutputLayout {
    if (!this.solved) {
      throw new Error(
        "Pipeline execution incomplete. Ensure solve() is called.",
      )
    }

    if (
      !this.partitionPackingSolver?.solved ||
      !this.partitionPackingSolver.finalLayout
    ) {
      throw new Error(
        "Final layout extraction failed. Pipeline state is invalid.",
      )
    }

    const finalLayout = this.partitionPackingSolver.finalLayout

    // Validation: Check for physical design violations (overlaps)
    const overlaps = this.checkForOverlaps(finalLayout)
    if (overlaps.length > 0) {
      const details = overlaps
        .map(
          (o) => `${o.chip1} ↔ ${o.chip2} (Area: ${o.overlapArea.toFixed(4)})`,
        )
        .join(", ")

      console.warn(
        `Physical overlap detected: ${overlaps.length} violations found. Details: ${details}`,
      )
    }

    return finalLayout
  }
}
