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
import type { InputProblem, PinId, NetId } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import type { Point } from "@tscircuit/math-utils"

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

  pipelineDef = [
    definePipelineStep("chipPartitionsSolver", ChipPartitionsSolver, () => [], {
      onSolved: (solver) => {
        // Store partitions for next phase
      },
    }),
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

    // Create visualization of input graph
    const inputViz: GraphicsObject = {
      points: [],
      rects: [],
      lines: [],
      circles: [],
      texts: [],
    }

    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      const chipPins = chip.pins.map((p) => this.inputProblem.chipPinMap[p]!)

      const xs = chipPins.map((p) => p.offset.x)
      const ys = chipPins.map((p) => p.offset.y)

      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const maxX = Math.max(...xs)
      const maxY = Math.max(...ys)

      inputViz.rects!.push({
        center: { x: minX + (maxX - minX) / 2, y: minY + (maxY - minY) / 2 },
        width: maxX - minX,
        height: maxY - minY,
        // color: "blue",
        // opacity: 0.1,
      })
      inputViz.texts!.push({
        x: minX,
        y: minY - 10,
        text: chipId,
        color: "blue",
      })

      for (const pin of chipPins) {
        inputViz.circles!.push({
          center: { x: pin.offset.x, y: pin.offset.y },
          radius: 2,
          // color: "blue",
        })
      }
    }

    // for (const [groupId, group] of Object.entries(this.inputProblem.groupMap)) {
    //   for (const bound of group.shape) {
    //     inputViz.rects!.push({
    //       center: { x: bound.x + bound.width / 2, y: bound.y + bound.height / 2 },
    //       width: bound.width,
    //       height: bound.height,
    //       color: "green",
    //       opacity: 0.1,
    //     })
    //   }
    //   inputViz.texts!.push({
    //     x: group.shape[0]!.x,
    //     y: group.shape[0]!.y - 10,
    //     text: groupId,
    //     color: "green",
    //   })
    // }

    const pinToNetMap: Record<PinId, NetId> = {}

    for (const conn of Object.keys(this.inputProblem.netConnMap)) {
      const [pinId, netId] = conn.split("-") as [PinId, NetId]
      pinToNetMap[pinId] = netId
    }

    const netToPins: Record<NetId, PinId[]> = {}
    for (const [pinId, netId] of Object.entries(pinToNetMap)) {
      if (!netToPins[netId]) netToPins[netId] = []
      netToPins[netId]!.push(pinId)
    }

    for (const [netId, pinIds] of Object.entries(netToPins)) {
      const pinPositions = pinIds
        .map((pinId) => {
          const chipPin = this.inputProblem.chipPinMap[pinId]
          if (chipPin) return chipPin.offset
          const groupPin = this.inputProblem.groupPinMap[pinId]
          if (groupPin) return groupPin.offset
          return null
        })
        .filter(Boolean) as Point[]

      for (let i = 0; i < pinPositions.length; i++) {
        for (let j = i + 1; j < pinPositions.length; j++) {
          inputViz.lines!.push({
            points: [pinPositions[i]!, pinPositions[j]!],
            // color: "red",
            // opacity: 0.5,
          })
        }
      }
    }

    const visualizations = [
      inputViz,
      chipPartitionsViz,
      pinRangeMatchViz,
      pinRangeLayoutViz,
      pinRangeOverlapViz,
      partitionPackingViz,
    ].filter(Boolean) as GraphicsObject[]

    if (visualizations.length === 1) return visualizations[0]!

    // Simple combination of visualizations
    return {
      points: visualizations.flatMap((v) => v.points || []),
      rects: visualizations.flatMap((v) => v.rects || []),
      lines: visualizations.flatMap((v) => v.lines || []),
      circles: visualizations.flatMap((v) => v.circles || []),
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
