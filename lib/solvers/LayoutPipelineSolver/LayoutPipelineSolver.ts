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
import { pack } from "calculate-packing"

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

    // Get basic layout positions to avoid overlapping at (0,0)
    const basicLayout = doBasicInputProblemLayout(this.inputProblem)

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
      const placement = basicLayout.chipPlacements[chipId]

      if (!placement) continue
      // Use chip.size if available, otherwise calculate from pin positions
      const width = chip.size.x
      const height = chip.size.y

      // Position chip at its placement location
      const chipCenterX = placement.x
      const chipCenterY = placement.y

      inputViz.rects!.push({
        center: { x: chipCenterX, y: chipCenterY },
        width,
        height,
        label: chipId,
      })

      // Use points instead of circles for pins
      for (const pin of chipPins) {
        inputViz.points!.push({
          x: placement.x + pin.offset.x,
          y: placement.y + pin.offset.y,
          label: pin.pinId,
        })
      }
    }
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

    for (const [, pinIds] of Object.entries(netToPins)) {
      const pinPositions = pinIds
        .map((pinId) => {
          const chipPin = this.inputProblem.chipPinMap[pinId]
          if (chipPin) {
            // Find which chip this pin belongs to
            for (const [chipId, chip] of Object.entries(
              this.inputProblem.chipMap,
            )) {
              if (chip.pins.includes(pinId)) {
                const placement = basicLayout.chipPlacements[chipId]
                if (placement) {
                  return {
                    x: placement.x + chipPin.offset.x,
                    y: placement.y + chipPin.offset.y,
                  }
                }
              }
            }
            return chipPin.offset
          }
          const groupPin = this.inputProblem.groupPinMap[pinId]
          if (groupPin) return groupPin.offset
          return null
        })
        .filter(Boolean) as Point[]

      for (let i = 0; i < pinPositions.length; i++) {
        for (let j = i + 1; j < pinPositions.length; j++) {
          inputViz.lines!.push({
            points: [pinPositions[i]!, pinPositions[j]!],
            strokeColor: "rgba(0,0,0,0.1)",
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

export function doBasicInputProblemLayout(
  inputProblem: InputProblem,
): OutputLayout {
  // Convert InputProblem to calculate-packing format
  const components = Object.entries(inputProblem.chipMap).map(
    ([chipId, chip]) => {
      const chipPins = chip.pins.map((pinId) => inputProblem.chipPinMap[pinId]!)

      // Note: We don't need to calculate bounding box - the pack algorithm calculates from pads

      // Convert pins to pads with network information
      const pads = chipPins.map((pin) => {
        // Find which network this pin connects to
        let networkId = "unconnected"
        for (const [connKey, connected] of Object.entries(
          inputProblem.netConnMap,
        )) {
          if (connected && connKey.includes(pin.pinId)) {
            const parts = connKey.split("-")
            const otherPart = parts.find((p) => p !== pin.pinId)
            if (otherPart && inputProblem.netMap[otherPart]) {
              networkId = otherPart
              break
            }
          }
        }

        return {
          padId: pin.pinId,
          networkId,
          type: "rect" as const,
          offset: pin.offset,
          size: { x: 1, y: 1 }, // Small pad size
        }
      })

      return {
        componentId: chipId,
        pads,
      }
    },
  )

  // Pack with specified gap
  const packResult = pack({
    components,
    minGap: 2,
    packOrderStrategy: "largest_to_smallest",
    packPlacementStrategy: "shortest_connection_along_outline",
  })

  // Convert pack result to OutputLayout
  const chipPlacements: Record<
    string,
    { x: number; y: number; ccwRotationDegrees: number }
  > = {}

  for (const component of packResult.components) {
    chipPlacements[component.componentId] = {
      x: component.center.x,
      y: component.center.y,
      ccwRotationDegrees: component.ccwRotationOffset,
    }
  }

  return {
    chipPlacements,
    groupPlacements: {}, // No groups for now
  }
}
