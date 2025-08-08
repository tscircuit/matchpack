/**
 * Pipeline solver that runs a series of solvers to find the best schematic layout.
 * Coordinates the entire layout process from chip partitioning through final packing.
 */

import { BaseSolver } from "lib/solvers/BaseSolver"
import type { GraphicsObject } from "graphics-debug"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { PinRangeMatchSolver } from "lib/solvers/PinRangeMatchSolver/PinRangeMatchSolver"
import { PinRangeLayoutSolver } from "lib/solvers/PinRangeLayoutSolver/PinRangeLayoutSolver"
import { PinRangeOverlapSolver } from "lib/solvers/PinRangeOverlapSolver/PinRangeOverlapSolver"
import { PartitionPackingSolver } from "lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { pack } from "calculate-packing"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "./doBasicInputProblemLayout"

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
  pinRangeMatchSolver?: PinRangeMatchSolver
  pinRangeLayoutSolver?: PinRangeLayoutSolver
  pinRangeOverlapSolver?: PinRangeOverlapSolver
  partitionPackingSolver?: PartitionPackingSolver

  startTimeOfPhase: Record<string, number>
  endTimeOfPhase: Record<string, number>
  timeSpentOnPhase: Record<string, number>

  inputProblem: InputProblem
  chipPartitions?: ChipPartitionsSolver["partitions"]

  pipelineDef = [
    definePipelineStep(
      "chipPartitionsSolver",
      ChipPartitionsSolver,
      () => [this.inputProblem],
      {
        onSolved: (layoutSolver) => {
          this.chipPartitions = this.chipPartitionsSolver!.partitions
        },
      },
    ),
    definePipelineStep("pinRangeMatchSolver", PinRangeMatchSolver, () => [], {
      onSolved: (solver) => {
        // Store matched layouts for next phase
      },
    }),
    definePipelineStep("pinRangeLayoutSolver", PinRangeLayoutSolver, () => [], {
      onSolved: (solver) => {
        // Store laid out pin ranges for next phase
      },
    }),
    definePipelineStep(
      "pinRangeOverlapSolver",
      PinRangeOverlapSolver,
      () => [],
      {
        onSolved: (solver) => {
          // Store overlap-resolved layout for next phase
        },
      },
    ),
    definePipelineStep(
      "partitionPackingSolver",
      PartitionPackingSolver,
      () => [],
      {
        onSolved: (solver) => {
          // Store final packed layout as output
        },
      },
    ),
  ]

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
    this.MAX_ITERATIONS = 1000
    this.startTimeOfPhase = {}
    this.endTimeOfPhase = {}
    this.timeSpentOnPhase = {}
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

    const chipPartitionsViz = this.chipPartitionsSolver?.visualize()
    const pinRangeMatchViz = this.pinRangeMatchSolver?.visualize()
    const pinRangeLayoutViz = this.pinRangeLayoutSolver?.visualize()
    const pinRangeOverlapViz = this.pinRangeOverlapSolver?.visualize()
    const partitionPackingViz = this.partitionPackingSolver?.visualize()

    // Get basic layout positions to avoid overlapping at (0,0)
    const basicLayout = doBasicInputProblemLayout(this.inputProblem)
    const inputViz = visualizeInputProblem(this.inputProblem, basicLayout)

    const visualizations = [
      inputViz,
      chipPartitionsViz,
      pinRangeMatchViz,
      pinRangeLayoutViz,
      pinRangeOverlapViz,
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
    if (this.pinRangeOverlapSolver?.solved) {
      return this.pinRangeOverlapSolver.visualize()
    }
    if (this.pinRangeLayoutSolver?.solved) {
      return this.pinRangeLayoutSolver.visualize()
    }
    if (this.pinRangeMatchSolver?.solved) {
      return this.pinRangeMatchSolver.visualize()
    }
    if (this.chipPartitionsSolver?.solved) {
      return this.chipPartitionsSolver.visualize()
    }

    return super.preview()
  }

  getOutputLayout(): OutputLayout {
    throw new Error("Not implemented")
  }
}
