/**
 * Post-processing optimization phase that tries mirroring each packed partition
 * (flip-X, flip-Y, flip-XY) to minimize cross-partition connection wire length.
 *
 * Partitions are moved as rigid blocks — no overlaps can be introduced — so this
 * phase is always safe to apply.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import type { PackedPartition } from "lib/solvers/PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import type { InputProblem, PinId } from "lib/types/InputProblem"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"

export interface PartitionFlipOptimizationSolverInput {
  currentLayout: OutputLayout
  packedPartitions: PackedPartition[]
  inputProblem: InputProblem
}

type FlipConfig = { flipX: boolean; flipY: boolean }

export class PartitionFlipOptimizationSolver extends BaseSolver {
  currentLayout: OutputLayout
  packedPartitions: PackedPartition[]
  inputProblem: InputProblem
  improvedLayout: OutputLayout | null = null

  constructor(input: PartitionFlipOptimizationSolverInput) {
    super()
    this.currentLayout = input.currentLayout
    this.packedPartitions = input.packedPartitions
    this.inputProblem = input.inputProblem
  }

  override _step() {
    // Work on a mutable copy of the layout
    const layout: OutputLayout = {
      chipPlacements: { ...this.currentLayout.chipPlacements },
      groupPlacements: { ...this.currentLayout.groupPlacements },
    }

    for (const partition of this.packedPartitions) {
      const chipIds = Object.keys(partition.layout.chipPlacements)

      // Skip partitions with fixed chips — we must not move them
      if (chipIds.some((id) => this.inputProblem.chipMap[id]?.fixedPosition)) {
        continue
      }

      const center = this.partitionCenter(chipIds, layout)
      const baseCost = this.crossPartitionCost(chipIds, center, layout, {
        flipX: false,
        flipY: false,
      })

      let bestCost = baseCost
      let bestFlip: FlipConfig = { flipX: false, flipY: false }

      for (const flip of [
        { flipX: true, flipY: false },
        { flipX: false, flipY: true },
        { flipX: true, flipY: true },
      ] as FlipConfig[]) {
        const cost = this.crossPartitionCost(chipIds, center, layout, flip)
        if (cost < bestCost) {
          bestCost = cost
          bestFlip = flip
        }
      }

      if (bestFlip.flipX || bestFlip.flipY) {
        this.applyFlip(chipIds, center, bestFlip, layout)
      }
    }

    this.improvedLayout = layout
    this.solved = true
  }

  /** Centroid of all chips in this partition (using current layout positions). */
  private partitionCenter(
    chipIds: string[],
    layout: OutputLayout,
  ): { x: number; y: number } {
    let sumX = 0
    let sumY = 0
    for (const id of chipIds) {
      sumX += layout.chipPlacements[id]!.x
      sumY += layout.chipPlacements[id]!.y
    }
    return { x: sumX / chipIds.length, y: sumY / chipIds.length }
  }

  /**
   * Compute the sum of Manhattan distances for every connection that crosses the
   * boundary between this partition and the rest of the layout, under a given flip.
   */
  private crossPartitionCost(
    chipIds: string[],
    center: { x: number; y: number },
    layout: OutputLayout,
    flip: FlipConfig,
  ): number {
    const chipIdSet = new Set(chipIds)
    const { netConnMap, pinStrongConnMap, chipPinMap, chipMap } =
      this.inputProblem

    // Build pin → chip lookup
    const pinToChip: Record<PinId, string> = {}
    for (const [chipId, chip] of Object.entries(chipMap)) {
      for (const pinId of chip.pins) {
        pinToChip[pinId] = chipId
      }
    }

    let cost = 0

    for (const chipId of chipIds) {
      const chip = chipMap[chipId]
      if (!chip) continue
      const placement = layout.chipPlacements[chipId]!

      for (const pinId of chip.pins) {
        const pin = chipPinMap[pinId]
        if (!pin) continue

        // World position of this pin, optionally under the flip
        const pinPos = this.pinWorldPos(pin.offset, placement, center, flip)

        // Check netConnMap for cross-partition connections
        for (const key of Object.keys(netConnMap)) {
          if (!key.startsWith(`${pinId}-`)) continue
          // netConnMap key: `${pinId}-${netId}`; find all other pins on that net
          const netId = key.slice(pinId.length + 1)
          for (const otherKey of Object.keys(netConnMap)) {
            if (!otherKey.endsWith(`-${netId}`)) continue
            const otherPinId = otherKey.slice(0, -(netId.length + 1))
            if (otherPinId === pinId) continue
            const otherChipId = pinToChip[otherPinId]
            if (!otherChipId || chipIdSet.has(otherChipId)) continue

            const otherPin = chipPinMap[otherPinId]
            const otherPlacement = layout.chipPlacements[otherChipId]
            if (!otherPin || !otherPlacement) continue

            const otherPos = this.pinWorldPos(
              otherPin.offset,
              otherPlacement,
              center,
              { flipX: false, flipY: false },
            )
            cost +=
              Math.abs(pinPos.x - otherPos.x) +
              Math.abs(pinPos.y - otherPos.y)
          }
        }

        // Check pinStrongConnMap for cross-partition connections
        for (const key of Object.keys(pinStrongConnMap)) {
          if (!key.startsWith(`${pinId}-`)) continue
          const otherPinId = key.slice(pinId.length + 1)
          const otherChipId = pinToChip[otherPinId]
          if (!otherChipId || chipIdSet.has(otherChipId)) continue

          const otherPin = chipPinMap[otherPinId]
          const otherPlacement = layout.chipPlacements[otherChipId]
          if (!otherPin || !otherPlacement) continue

          const otherPos = this.pinWorldPos(
            otherPin.offset,
            otherPlacement,
            center,
            { flipX: false, flipY: false },
          )
          cost +=
            Math.abs(pinPos.x - otherPos.x) + Math.abs(pinPos.y - otherPos.y)
        }
      }
    }

    return cost
  }

  /**
   * World position of a pin after optionally flipping its chip around the partition
   * center. `flip` is applied only when the chip belongs to the partition being
   * optimised (the caller never passes a flip when computing the OTHER side of a
   * cross-partition connection).
   */
  private pinWorldPos(
    offset: { x: number; y: number },
    placement: Placement,
    center: { x: number; y: number },
    flip: FlipConfig,
  ): { x: number; y: number } {
    const theta = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)

    // Rotate pin offset by chip rotation
    const rx = offset.x * cos - offset.y * sin
    const ry = offset.x * sin + offset.y * cos

    let wx = placement.x + rx
    let wy = placement.y + ry

    // Apply flip around partition center
    if (flip.flipX) wx = 2 * center.x - wx
    if (flip.flipY) wy = 2 * center.y - wy

    return { x: wx, y: wy }
  }

  /** Mutate `layout` in-place, applying the chosen flip to all chips in the partition. */
  private applyFlip(
    chipIds: string[],
    center: { x: number; y: number },
    flip: FlipConfig,
    layout: OutputLayout,
  ) {
    for (const chipId of chipIds) {
      const p = layout.chipPlacements[chipId]!
      let { x, y, ccwRotationDegrees } = p

      if (flip.flipX) {
        x = 2 * center.x - x
        ccwRotationDegrees = (360 - ccwRotationDegrees) % 360
      }
      if (flip.flipY) {
        y = 2 * center.y - y
        ccwRotationDegrees = (540 - ccwRotationDegrees) % 360
      }

      layout.chipPlacements[chipId] = { x, y, ccwRotationDegrees }
    }
  }

  override visualize(): GraphicsObject {
    return { rects: [], points: [], lines: [] }
  }

  override getConstructorParams(): PartitionFlipOptimizationSolverInput {
    return {
      currentLayout: this.currentLayout,
      packedPartitions: this.packedPartitions,
      inputProblem: this.inputProblem,
    }
  }
}
