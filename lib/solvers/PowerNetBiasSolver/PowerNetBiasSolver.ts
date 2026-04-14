/**
 * Post-pack phase that applies vertical bias to chips based on their power/ground
 * net connectivity, then resolves any resulting overlaps.
 *
 * Chips predominantly connected to positive voltage nets (VCC, VDD, V+) are
 * displaced upward (negative Y). Chips predominantly connected to ground nets
 * (GND, VSS) are displaced downward (positive Y). This produces schematics that
 * match the conventional "power at top, ground at bottom" readability standard.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

/** Bias displacement = chipGap × BIAS_SCALE × netRatio */
const BIAS_SCALE = 5

/** Minimum net ratio (0–1) required before any bias is applied */
const MIN_BIAS_RATIO = 0.2

/** Max iterations for the overlap-resolution loop */
const MAX_OVERLAP_ITERS = 100

export class PowerNetBiasSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  outputLayout: OutputLayout | null = null

  constructor(params: {
    inputProblem: InputProblem
    inputLayout: OutputLayout
  }) {
    super()
    this.inputProblem = params.inputProblem
    this.inputLayout = params.inputLayout
  }

  override _step() {
    this.outputLayout = this.applyVerticalBias()
    this.solved = true
  }

  /**
   * Compute each chip's power/ground net ratio, apply vertical bias, then
   * run an overlap-resolution pass so no chips end up on top of each other.
   */
  private applyVerticalBias(): OutputLayout {
    // Deep-copy placements so we don't mutate the input layout
    const chipPlacements: Record<string, Placement> = {}
    for (const [chipId, p] of Object.entries(this.inputLayout.chipPlacements)) {
      chipPlacements[chipId] = { ...p }
    }

    // Build a fast pin→nets lookup: pinId → netId[]
    const pinToNets = new Map<string, string[]>()
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const sep = connKey.indexOf("-")
      if (sep === -1) continue
      const pinId = connKey.slice(0, sep)
      const netId = connKey.slice(sep + 1)
      if (!pinToNets.has(pinId)) pinToNets.set(pinId, [])
      pinToNets.get(pinId)!.push(netId)
    }

    const biasAmount = this.inputProblem.chipGap * BIAS_SCALE

    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      if (!chipPlacements[chipId]) continue
      const total = chip.pins.length
      if (total === 0) continue

      let powerPins = 0
      let groundPins = 0

      for (const pinId of chip.pins) {
        const nets = pinToNets.get(pinId)
        if (!nets) continue
        for (const netId of nets) {
          const net = this.inputProblem.netMap[netId]
          if (!net) continue
          if (net.isPositiveVoltageSource) powerPins++
          if (net.isGround) groundPins++
        }
      }

      const powerRatio = powerPins / total
      const groundRatio = groundPins / total
      const placement = chipPlacements[chipId]!

      if (powerRatio >= MIN_BIAS_RATIO && powerRatio > groundRatio) {
        // Bias upward — positive Y in schematic/math coordinates (power at top)
        placement.y += biasAmount * powerRatio
      } else if (groundRatio >= MIN_BIAS_RATIO && groundRatio > powerRatio) {
        // Bias downward — negative Y (ground at bottom)
        placement.y -= biasAmount * groundRatio
      }
    }

    const biased: OutputLayout = {
      chipPlacements,
      groupPlacements: { ...this.inputLayout.groupPlacements },
    }

    return this.resolveOverlaps(biased)
  }

  /**
   * Iteratively push overlapping chip pairs apart until no overlaps remain
   * or the iteration limit is reached.
   */
  private resolveOverlaps(layout: OutputLayout): OutputLayout {
    const placements = layout.chipPlacements
    const chipIds = Object.keys(placements)
    const minGap = this.inputProblem.chipGap

    for (let iter = 0; iter < MAX_OVERLAP_ITERS; iter++) {
      let anyOverlap = false

      for (let i = 0; i < chipIds.length; i++) {
        for (let j = i + 1; j < chipIds.length; j++) {
          const id1 = chipIds[i]!
          const id2 = chipIds[j]!
          const p1 = placements[id1]!
          const p2 = placements[id2]!
          const chip1 = this.inputProblem.chipMap[id1]
          const chip2 = this.inputProblem.chipMap[id2]
          if (!chip1 || !chip2) continue

          const { x: hw1, y: hh1 } = this.rotatedHalfDims(
            chip1.size,
            p1.ccwRotationDegrees,
          )
          const { x: hw2, y: hh2 } = this.rotatedHalfDims(
            chip2.size,
            p2.ccwRotationDegrees,
          )

          const requiredX = hw1 + hw2 + minGap
          const requiredY = hh1 + hh2 + minGap
          const dX = Math.abs(p1.x - p2.x)
          const dY = Math.abs(p1.y - p2.y)

          const gapX = requiredX - dX
          const gapY = requiredY - dY

          if (gapX > 0 && gapY > 0) {
            anyOverlap = true
            // Resolve along the axis with the smaller penetration depth
            if (gapX <= gapY) {
              const push = gapX / 2 + 1e-6
              if (p1.x <= p2.x) {
                p1.x -= push
                p2.x += push
              } else {
                p1.x += push
                p2.x -= push
              }
            } else {
              const push = gapY / 2 + 1e-6
              if (p1.y <= p2.y) {
                p1.y -= push
                p2.y += push
              } else {
                p1.y += push
                p2.y -= push
              }
            }
          }
        }
      }

      if (!anyOverlap) break
    }

    return layout
  }

  /** Returns axis-aligned half-dimensions of a chip accounting for rotation. */
  private rotatedHalfDims(
    size: { x: number; y: number },
    rotation: number,
  ): { x: number; y: number } {
    const swap = rotation === 90 || rotation === 270
    return {
      x: (swap ? size.y : size.x) / 2,
      y: (swap ? size.x : size.y) / 2,
    }
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.inputProblem,
      this.outputLayout ?? this.inputLayout,
    )
  }

  override getConstructorParams(): [
    { inputProblem: InputProblem; inputLayout: OutputLayout },
  ] {
    return [{ inputProblem: this.inputProblem, inputLayout: this.inputLayout }]
  }
}
