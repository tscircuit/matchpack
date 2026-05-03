/**
 * Specialized packer for decoupling capacitor partitions.
 *
 * Instead of using the general PackSolver2 (which scatters caps based on
 * connection-distance heuristics), this solver places all caps in a clean
 * horizontal row sorted by chipId. The result is a tidy single-row block
 * that the outer PartitionPackingSolver can attach next to the main chip's
 * power pins as one unit.
 */

import type { GraphicsObject } from "graphics-debug"
import type { PackedComponent } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { PartitionInputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export type { PackedComponent }

export class DecouplingCapsHorizontalRowSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  packedComponents: PackedComponent[] = []
  layout: OutputLayout | null = null

  constructor(partitionInputProblem: PartitionInputProblem) {
    super()
    this.partitionInputProblem = partitionInputProblem
  }

  override _step() {
    const { chipMap, chipGap, decouplingCapsGap } = this.partitionInputProblem

    const gap = decouplingCapsGap ?? chipGap

    // Sort chips by chipId for stable deterministic ordering
    const chips = Object.values(chipMap).sort((a, b) =>
      a.chipId.localeCompare(b.chipId, undefined, { numeric: true }),
    )

    if (chips.length === 0) {
      this.packedComponents = []
      this.layout = { chipPlacements: {}, groupPlacements: {} }
      this.solved = true
      return
    }

    // Lay out chips in a horizontal row, centered at origin
    // Each chip occupies size.x width, separated by gap
    const totalWidth =
      chips.reduce((sum, c) => sum + c.size.x, 0) + gap * (chips.length - 1)

    let cursor = -totalWidth / 2
    const packed: PackedComponent[] = []

    for (const chip of chips) {
      const x = cursor + chip.size.x / 2
      const y = 0
      // Use the first available rotation (IdentifyDecouplingCapsSolver restricts
      // decoupling caps to 0/180 degrees already)
      const rotation =
        chip.availableRotations && chip.availableRotations.length > 0
          ? chip.availableRotations[0]!
          : 0

      packed.push({
        componentId: chip.chipId,
        center: { x, y },
        ccwRotationDegrees: rotation,
        ccwRotationOffset: rotation,
        pads: [],
      })

      cursor += chip.size.x + gap
    }

    this.packedComponents = packed

    // Build OutputLayout from packed components
    const chipPlacements: OutputLayout["chipPlacements"] = {}
    for (const p of packed) {
      chipPlacements[p.componentId] = {
        x: p.center.x,
        y: p.center.y,
        ccwRotationDegrees: p.ccwRotationDegrees ?? p.ccwRotationOffset ?? 0,
      }
    }
    this.layout = { chipPlacements, groupPlacements: {} }

    this.solved = true
  }

  override visualize(): GraphicsObject {
    if (this.layout) {
      return visualizeInputProblem(this.partitionInputProblem, this.layout)
    }
    return super.visualize()
  }

  override getConstructorParams(): [PartitionInputProblem] {
    return [this.partitionInputProblem]
  }
}
