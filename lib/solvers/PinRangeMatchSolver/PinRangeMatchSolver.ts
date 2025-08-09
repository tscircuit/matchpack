/**
 * Finds pin ranges on each chip in the partition and matches layouts from the corpus.
 * Creates subset groups with pin ranges and finds pre-laid-out designs that match.
 */

import type { GraphicsObject } from "graphics-debug"
import { stackGraphicsHorizontally } from "graphics-debug"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { BaseSolver } from "../BaseSolver"
import type { InputProblem } from "../../types/InputProblem"
import {
  PartitionPinRangeMatchSolver,
  type PinRange,
} from "./PartitionPinRangeMatchSolver/PartitionPinRangeMatchSolver"

export class PinRangeMatchSolver extends BaseSolver {
  partitions: InputProblem[]
  currentPartitionIndex = 0
  activeSubSolver: PartitionPinRangeMatchSolver | null = null
  partitionResults: PinRange[][] = []

  constructor(partitions: InputProblem[]) {
    super()
    this.partitions = partitions
  }

  override _step() {
    if (this.currentPartitionIndex >= this.partitions.length) {
      this.solved = true
      return
    }

    // Create or progress the current partition's sub-solver
    if (!this.activeSubSolver) {
      const currentPartition = this.partitions[this.currentPartitionIndex]!
      this.activeSubSolver = new PartitionPinRangeMatchSolver(currentPartition)
    }

    if (!this.activeSubSolver.solved && !this.activeSubSolver.failed) {
      this.activeSubSolver.step()
      return
    }

    if (this.activeSubSolver.failed) {
      this.failed = true
      this.error = `Partition ${this.currentPartitionIndex} failed: ${this.activeSubSolver.error}`
      return
    }

    if (this.activeSubSolver.solved) {
      // Store the results
      this.partitionResults.push(this.activeSubSolver.pinRanges)

      // Move to next partition
      this.currentPartitionIndex++
      this.activeSubSolver = null
    }
  }

  getAllPinRanges(): PinRange[] {
    return this.partitionResults.flat()
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver && !this.activeSubSolver.solved) {
      return this.activeSubSolver.visualize()
    }

    if (this.partitions.length === 0) {
      return super.visualize()
    }

    // Create visualization for each partition
    const partitionVisualizations = this.partitions.map(
      (partition, partitionIndex) => {
        // Create basic layout for chip positioning
        const basicLayout = doBasicInputProblemLayout(partition)

        // Start with the basic input problem visualization (chips, pins, connections)
        const baseViz = visualizeInputProblem(partition, basicLayout)

        // Get pin ranges for this partition
        const partitionRanges = this.partitionResults[partitionIndex] || []

        // Add highlighting rectangles for each pin range and connected passives
        const highlightRects = partitionRanges
          .flatMap((range, rangeIndex) => {
            const rects = []
            
            // Main pin range highlighting
            const rangePositions = range.pinIds
              .map((pinId) => {
                const chipPin = partition.chipPinMap[pinId]
                const groupPin = partition.groupPinMap[pinId]
                const offset = chipPin?.offset || groupPin?.offset

                if (offset && chipPin) {
                  // Find chip placement to get absolute position
                  const chipId = Object.entries(partition.chipMap).find(
                    ([, chip]) => chip.pins.includes(pinId),
                  )?.[0]

                  if (chipId) {
                    const placement = basicLayout.chipPlacements[chipId]
                    if (placement) {
                      return {
                        x: placement.x + offset.x,
                        y: placement.y + offset.y,
                      }
                    }
                  }
                }
                return offset
              })
              .filter((pos) => pos !== null && pos !== undefined)

            if (rangePositions.length > 0) {
              // Calculate bounding box with padding
              const xs = rangePositions.map((p) => p!.x)
              const ys = rangePositions.map((p) => p!.y)
              const minX = Math.min(...xs) - 0.05
              const maxX = Math.max(...xs) + 0.05
              const minY = Math.min(...ys) - 0.05
              const maxY = Math.max(...ys) + 0.05

              rects.push({
                center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
                width: Math.max(0.1, maxX - minX),
                height: Math.max(0.1, maxY - minY),
                strokeColor: `hsl(${(rangeIndex * 60) % 360}, 70%, 50%)`,
                fillColor: `hsla(${(rangeIndex * 60) % 360}, 70%, 50%, 0.1)`,
                strokeWidth: 2,
                label: `Range ${rangeIndex} (${range.side})`,
              })
            }

            // Connected passive chips highlighting
            if (range.connectedChips && range.connectedChips.length > 0) {
              for (const connectedChipId of range.connectedChips) {
                const placement = basicLayout.chipPlacements[connectedChipId]
                const chip = partition.chipMap[connectedChipId]
                
                if (placement && chip) {
                  rects.push({
                    center: { x: placement.x, y: placement.y },
                    width: chip.size.x + 0.2,
                    height: chip.size.y + 0.2,
                    strokeColor: `hsl(${(rangeIndex * 60) % 360}, 70%, 30%)`,
                    fillColor: `hsla(${(rangeIndex * 60) % 360}, 70%, 30%, 0.1)`,
                    strokeWidth: 1,
                    strokeDashArray: [3, 3],
                    label: `Connected: ${connectedChipId}`,
                  })
                }
              }
            }

            return rects
          })
          .filter((rect) => rect !== null)

        return {
          ...baseViz,
          rects: [...(baseViz.rects || []), ...highlightRects],
        }
      },
    )

    // Create titles for each partition
    const titles = this.partitions.map((_, index) => {
      const ranges = this.partitionResults[index] || []
      const rangeCount = ranges.length
      const connectedCount = ranges.reduce((sum, range) => sum + (range.connectedChips?.length || 0), 0)
      return `Partition ${index} (${rangeCount} ranges, ${connectedCount} passives)`
    })

    return stackGraphicsHorizontally(partitionVisualizations, { titles })
  }

  override getConstructorParams() {
    return { partitions: this.partitions }
  }
}

// Re-export types and classes for convenience
export { PartitionPinRangeMatchSolver, type PinRange }
