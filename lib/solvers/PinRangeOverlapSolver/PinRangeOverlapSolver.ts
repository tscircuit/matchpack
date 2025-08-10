/**
 * Finds overlaps between laid out boxes from each pin range and fixes them.
 * Resolves spatial conflicts between different pin range layouts.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { PinRange } from "../PinRangeMatchSolver/PartitionPinRangeMatchSolver/PartitionPinRangeMatchSolver"
import type { InputProblem } from "../../types/InputProblem"
import { PinRangeLayoutSolver } from "../PinRangeLayoutSolver/PinRangeLayoutSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

type ComponentBounds = {
  chipId: string
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  placement: Placement
}

export class PinRangeOverlapSolver extends BaseSolver {
  pinRangeLayoutSolver: PinRangeLayoutSolver | null = null
  inputProblems: InputProblem[]
  resolvedLayout: OutputLayout | null = null

  constructor(
    pinRangeLayoutSolver: PinRangeLayoutSolver,
    inputProblems: InputProblem[],
  ) {
    super()
    this.pinRangeLayoutSolver = pinRangeLayoutSolver
    this.inputProblems = inputProblems
  }

  override _step() {
    try {
      if (!this.pinRangeLayoutSolver?.solved) {
        this.failed = true
        this.error = "PinRangeLayoutSolver not solved"
        return
      }

      // Collect all component placements from completed solvers
      const allChipPlacements: Record<string, Placement> = {}
      const allGroupPlacements: Record<string, Placement> = {}

      // Merge layouts from all completed pin range solvers
      for (const singleSolver of this.pinRangeLayoutSolver.completedSolvers) {
        if (singleSolver.layout) {
          Object.assign(allChipPlacements, singleSolver.layout.chipPlacements)
          Object.assign(allGroupPlacements, singleSolver.layout.groupPlacements)
        }
      }

      // Include active solver if it has a layout
      if (this.pinRangeLayoutSolver.activeSolver?.layout) {
        Object.assign(
          allChipPlacements,
          this.pinRangeLayoutSolver.activeSolver.layout.chipPlacements,
        )
        Object.assign(
          allGroupPlacements,
          this.pinRangeLayoutSolver.activeSolver.layout.groupPlacements,
        )
      }

      // Find overlapping components
      const overlaps = this.findOverlaps(allChipPlacements)

      if (overlaps.length > 0) {
        // Resolve overlaps by shifting components
        this.resolveOverlaps(allChipPlacements, overlaps)
      }

      this.resolvedLayout = {
        chipPlacements: allChipPlacements,
        groupPlacements: allGroupPlacements,
      }

      this.solved = true
    } catch (error) {
      this.failed = true
      this.error = `Failed to resolve pin range overlaps: ${error}`
    }
  }

  private findOverlaps(chipPlacements: Record<string, Placement>): Array<{
    chip1: string
    chip2: string
    bounds1: ComponentBounds["bounds"]
    bounds2: ComponentBounds["bounds"]
  }> {
    const components = this.getComponentBounds(chipPlacements)
    const overlaps: Array<{
      chip1: string
      chip2: string
      bounds1: ComponentBounds["bounds"]
      bounds2: ComponentBounds["bounds"]
    }> = []

    // Check each pair of components for overlap
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const comp1 = components[i]!
        const comp2 = components[j]!

        if (this.boundsOverlap(comp1.bounds, comp2.bounds)) {
          overlaps.push({
            chip1: comp1.chipId,
            chip2: comp2.chipId,
            bounds1: comp1.bounds,
            bounds2: comp2.bounds,
          })
        }
      }
    }

    return overlaps
  }

  private getComponentBounds(
    chipPlacements: Record<string, Placement>,
  ): ComponentBounds[] {
    const components: ComponentBounds[] = []

    for (const [chipId, placement] of Object.entries(chipPlacements)) {
      // Find chip size from input problems
      let chipSize = { x: 1, y: 1 } // Default size
      for (const inputProblem of this.inputProblems) {
        const chip = inputProblem.chipMap[chipId]
        if (chip) {
          chipSize = chip.size
          break
        }
      }

      // Calculate bounds considering rotation
      const halfWidth = chipSize.x / 2
      const halfHeight = chipSize.y / 2

      // For simplicity, use axis-aligned bounding box (could be improved with rotated bounds)
      const bounds = {
        minX: placement.x - halfWidth,
        maxX: placement.x + halfWidth,
        minY: placement.y - halfHeight,
        maxY: placement.y + halfHeight,
      }

      components.push({
        chipId,
        bounds,
        placement,
      })
    }

    return components
  }

  private boundsOverlap(
    bounds1: ComponentBounds["bounds"],
    bounds2: ComponentBounds["bounds"],
  ): boolean {
    return !(
      bounds1.maxX <= bounds2.minX ||
      bounds1.minX >= bounds2.maxX ||
      bounds1.maxY <= bounds2.minY ||
      bounds1.minY >= bounds2.maxY
    )
  }

  private resolveOverlaps(
    chipPlacements: Record<string, Placement>,
    overlaps: Array<{
      chip1: string
      chip2: string
      bounds1: ComponentBounds["bounds"]
      bounds2: ComponentBounds["bounds"]
    }>,
  ) {
    // Simple overlap resolution: push components apart along the axis with least overlap
    for (const overlap of overlaps) {
      const { chip1, chip2, bounds1, bounds2 } = overlap

      // Calculate overlap distances
      const overlapX = Math.min(
        bounds1.maxX - bounds2.minX,
        bounds2.maxX - bounds1.minX,
      )
      const overlapY = Math.min(
        bounds1.maxY - bounds2.minY,
        bounds2.maxY - bounds1.minY,
      )

      const placement1 = chipPlacements[chip1]!
      const placement2 = chipPlacements[chip2]!

      // Resolve along the axis with smaller overlap to minimize movement
      if (overlapX < overlapY) {
        // Resolve horizontally
        const separation = overlapX / 2 + 0.1 // Add small buffer
        if (placement1.x < placement2.x) {
          placement1.x -= separation
          placement2.x += separation
        } else {
          placement1.x += separation
          placement2.x -= separation
        }
      } else {
        // Resolve vertically
        const separation = overlapY / 2 + 0.1 // Add small buffer
        if (placement1.y < placement2.y) {
          placement1.y -= separation
          placement2.y += separation
        } else {
          placement1.y += separation
          placement2.y -= separation
        }
      }
    }
  }

  override visualize(): GraphicsObject {
    if (!this.resolvedLayout) {
      return super.visualize()
    }

    // Create a combined input problem for visualization
    const combinedProblem: InputProblem = {
      chipMap: {},
      groupMap: {},
      chipPinMap: {},
      groupPinMap: {},
      pinStrongConnMap: {},
      netMap: {},
      netConnMap: {},
    }

    // Combine all input problems
    for (const inputProblem of this.inputProblems) {
      Object.assign(combinedProblem.chipMap, inputProblem.chipMap)
      Object.assign(combinedProblem.groupMap, inputProblem.groupMap)
      Object.assign(combinedProblem.chipPinMap, inputProblem.chipPinMap)
      Object.assign(combinedProblem.groupPinMap, inputProblem.groupPinMap)
      Object.assign(
        combinedProblem.pinStrongConnMap,
        inputProblem.pinStrongConnMap,
      )
      Object.assign(combinedProblem.netMap, inputProblem.netMap)
      Object.assign(combinedProblem.netConnMap, inputProblem.netConnMap)
    }

    return visualizeInputProblem(combinedProblem, this.resolvedLayout)
  }

  override getConstructorParams() {
    return {
      pinRangeLayoutSolver: this.pinRangeLayoutSolver,
      inputProblems: this.inputProblems,
    }
  }
}
