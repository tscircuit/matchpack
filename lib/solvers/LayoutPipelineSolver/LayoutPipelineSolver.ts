/**
 * Pipeline solver that runs a series of solvers to find the best schematic layout.
 * Coordinates the entire layout process from chip partitioning through final packing.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import {
  PackInnerPartitionsSolver,
  type PackedPartition,
} from "lib/solvers/PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import { PartitionPackingSolver } from "lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { doBasicInputProblemLayout } from "./doBasicInputProblemLayout"
import { visualizeInputProblem } from "./visualizeInputProblem"

type PipelineStep<T extends new (...args: any[]) => BaseSolver> = {
  solverName: string
  solverClass: T
  getConstructorParams: (
    instance: LayoutPipelineSolver,
  ) => ConstructorParameters<T>
  onSolved?: (instance: LayoutPipelineSolver) => void
}

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
  chipPartitionsSolver?: ChipPartitionsSolver
  packInnerPartitionsSolver?: PackInnerPartitionsSolver
  partitionPackingSolver?: PartitionPackingSolver

  startTimeOfPhase: Record<string, number>
  endTimeOfPhase: Record<string, number>
  timeSpentOnPhase: Record<string, number>
  firstIterationOfPhase: Record<string, number>

  inputProblem: InputProblem
  chipPartitions?: ChipPartitionsSolver["partitions"]
  packedPartitions?: PackedPartition[]

  pipelineDef = [
    definePipelineStep(
      "chipPartitionsSolver",
      ChipPartitionsSolver,
      () => [this.inputProblem],
      {
        onSolved: (_layoutSolver) => {
          this.chipPartitions = this.chipPartitionsSolver!.partitions
        },
      },
    ),
    definePipelineStep(
      "packInnerPartitionsSolver",
      PackInnerPartitionsSolver,
      () => [this.chipPartitions || [this.inputProblem]],
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
          // Store final packed layout as output
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
  }

  currentPipelineStepIndex = 0

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

    const constructorParams = pipelineStepDef.getConstructorParams(this)
    // @ts-ignore
    this.activeSubSolver = new pipelineStepDef.solverClass(...constructorParams)
    ;(this as any)[pipelineStepDef.solverName] = this.activeSubSolver
    this.timeSpentOnPhase[pipelineStepDef.solverName] = 0
    this.startTimeOfPhase[pipelineStepDef.solverName] = performance.now()
    this.firstIterationOfPhase[pipelineStepDef.solverName] = this.iterations
  }

  solveUntilPhase(phase: string) {
    while (this.getCurrentPhase() !== phase) {
      this.step()
    }
  }

  getCurrentPhase(): string {
    return this.pipelineDef[this.currentPipelineStepIndex]?.solverName ?? "none"
  }

  override visualize(): GraphicsObject {
    if (!this.solved && this.activeSubSolver)
      return this.activeSubSolver.visualize()

    // If the pipeline is complete and we have a partition packing solver,
    // show only the final chip placements
    if (this.solved && this.partitionPackingSolver?.solved) {
      return this.partitionPackingSolver.visualize()
    }

    const chipPartitionsViz = this.chipPartitionsSolver?.visualize()
    const packInnerPartitionsViz = this.packInnerPartitionsSolver?.visualize()
    const partitionPackingViz = this.partitionPackingSolver?.visualize()

    // Get basic layout positions to avoid overlapping at (0,0)
    const basicLayout = doBasicInputProblemLayout(this.inputProblem)
    const inputViz = visualizeInputProblem(this.inputProblem, basicLayout)

    const visualizations = [
      inputViz,
      chipPartitionsViz,
      packInnerPartitionsViz,
      partitionPackingViz,
    ]
      .filter(Boolean)
      .map((viz, stepIndex) => {
        for (const rect of viz!.rects ?? []) {
          rect.step = stepIndex
        }
        for (const point of viz!.points ?? []) {
          point.step = stepIndex
        }
        for (const circle of viz!.circles ?? []) {
          circle.step = stepIndex
        }
        for (const text of viz!.texts ?? []) {
          text.step = stepIndex
        }
        for (const line of viz!.lines ?? []) {
          line.step = stepIndex
        }
        return viz
      }) as GraphicsObject[]

    if (visualizations.length === 1) return visualizations[0]!

    // Simple combination of visualizations
    return {
      points: visualizations.flatMap((v) => v.points || []),
      rects: visualizations.flatMap((v) => v.rects || []),
      lines: visualizations.flatMap((v) => v.lines || []),
      circles: visualizations.flatMap((v) => v.circles || []),
      texts: visualizations.flatMap((v) => v.texts || []),
    }
  }

  /**
   * A lightweight version of the visualize method that can be used to stream
   * progress
   */
  override preview(): GraphicsObject {
    if (this.activeSubSolver) {
      return this.activeSubSolver.preview()
    }

    // Show the most recent solver's output
    if (this.partitionPackingSolver?.solved) {
      return this.partitionPackingSolver.visualize()
    }
    if (this.packInnerPartitionsSolver?.solved) {
      return this.packInnerPartitionsSolver.visualize()
    }
    if (this.chipPartitionsSolver?.solved) {
      return this.chipPartitionsSolver.visualize()
    }

    return super.preview()
  }

  /**
   * Checks if any chips are overlapping in the given layout, considering rotation.
   * Returns an array of overlapping chip pairs.
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

    // Check each pair of chips for overlap
    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const chip1Id = chipIds[i]!
        const chip2Id = chipIds[j]!
        const placement1 = layout.chipPlacements[chip1Id]!
        const placement2 = layout.chipPlacements[chip2Id]!

        // Get chip sizes from input problem
        const chip1 = this.inputProblem.chipMap[chip1Id]
        const chip2 = this.inputProblem.chipMap[chip2Id]

        if (!chip1 || !chip2) continue

        // Calculate rotated bounding boxes
        const bounds1 = this.getRotatedBounds(placement1, chip1.size)
        const bounds2 = this.getRotatedBounds(placement2, chip2.size)

        // Check for overlap
        const overlapArea = this.calculateOverlapArea(bounds1, bounds2)

        if (overlapArea > 0) {
          overlaps.push({
            chip1: chip1Id,
            chip2: chip2Id,
            overlapArea,
          })
        }
      }
    }

    return overlaps
  }

  /**
   * Calculate the axis-aligned bounding box for a rotated chip
   */
  private getRotatedBounds(
    placement: { x: number; y: number; ccwRotationDegrees: number },
    size: { x: number; y: number },
  ): {
    minX: number
    maxX: number
    minY: number
    maxY: number
  } {
    const halfWidth = size.x / 2
    const halfHeight = size.y / 2

    // For accurate overlap detection with rotation, calculate the axis-aligned bounding box
    // of the rotated rectangle
    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))

    // Rotated bounding box dimensions
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
   * Calculate the overlap area between two axis-aligned bounding boxes
   */
  private calculateOverlapArea(
    bounds1: {
      minX: number
      maxX: number
      minY: number
      maxY: number
    },
    bounds2: {
      minX: number
      maxX: number
      minY: number
      maxY: number
    },
  ): number {
    // Check if rectangles overlap
    if (
      bounds1.maxX <= bounds2.minX ||
      bounds1.minX >= bounds2.maxX ||
      bounds1.maxY <= bounds2.minY ||
      bounds1.minY >= bounds2.maxY
    ) {
      return 0 // No overlap
    }

    // Calculate overlap dimensions
    const overlapWidth =
      Math.min(bounds1.maxX, bounds2.maxX) -
      Math.max(bounds1.minX, bounds2.minX)
    const overlapHeight =
      Math.min(bounds1.maxY, bounds2.maxY) -
      Math.max(bounds1.minY, bounds2.minY)

    return overlapWidth * overlapHeight
  }

  getOutputLayout(): OutputLayout {
    if (!this.solved) {
      throw new Error(
        "Pipeline not solved yet. Call solve() or step() until solved.",
      )
    }

    let finalLayout: OutputLayout

    // Get the final layout from the partition packing solver
    if (
      this.partitionPackingSolver?.solved &&
      this.partitionPackingSolver.finalLayout
    ) {
      finalLayout = this.partitionPackingSolver.finalLayout
    } else {
      throw new Error(
        "No layout available. Pipeline may have failed or not progressed far enough.",
      )
    }

    // Check for overlaps in the final layout
    const overlaps = this.checkForOverlaps(finalLayout)
    if (overlaps.length > 0) {
      const overlapDetails = overlaps
        .map(
          (overlap) =>
            `${overlap.chip1} overlaps ${overlap.chip2} (area: ${overlap.overlapArea.toFixed(4)})`,
        )
        .join(", ")

      console.warn(
        `Warning: ${overlaps.length} chip overlaps detected in final layout: ${overlapDetails}`,
      )
    }

    return finalLayout
  }
}
