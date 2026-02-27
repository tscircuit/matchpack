/**
 * Resolves chip overlaps in the final layout using a force-directed approach.
 * After the partition packing solver produces a layout, this solver:
 * 1. Detects overlapping chips (including minimum gap enforcement)
 * 2. Applies repulsion forces to separate overlapping chips
 * 3. Applies attraction forces to keep connected chips close
 * 4. Applies voltage-aware biasing (VCC up, GND down) for conventional schematics
 * 5. Re-centers the layout after resolution
 * 6. Iterates until no overlaps remain or max iterations reached
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  InputProblem,
  ChipId,
  PinId,
  NetId,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

interface ChipBounds {
  chipId: string
  minX: number
  maxX: number
  minY: number
  maxY: number
  cx: number
  cy: number
}

export class OverlapResolutionSolver extends BaseSolver {
  inputProblem: InputProblem
  layout: OutputLayout
  resolvedLayout: OutputLayout | null = null

  private readonly REPULSION_STRENGTH = 1.5
  private readonly ATTRACTION_STRENGTH = 0.03
  private readonly VOLTAGE_BIAS_STRENGTH = 0.15
  private readonly MIN_SEPARATION: number
  private readonly MAX_RESOLVE_ITERATIONS = 300
  private resolveIterations = 0

  /** Cache: chip -> set of net IDs it connects to */
  private chipNetCache: Map<string, Set<string>> | null = null
  /** Cache: connected chip pairs via strong connections */
  private connectedPairsCache: Set<string> | null = null

  constructor(params: { inputProblem: InputProblem; layout: OutputLayout }) {
    super()
    this.inputProblem = params.inputProblem
    this.layout = params.layout
    this.MAX_ITERATIONS = this.MAX_RESOLVE_ITERATIONS + 10
    this.MIN_SEPARATION = params.inputProblem.chipGap
  }

  override _step() {
    if (this.resolveIterations === 0) {
      // Deep clone the layout to avoid mutating the original
      this.resolvedLayout = {
        chipPlacements: {},
        groupPlacements: { ...this.layout.groupPlacements },
      }
      for (const [id, p] of Object.entries(this.layout.chipPlacements)) {
        this.resolvedLayout.chipPlacements[id] = { ...p }
      }
    }

    const overlaps = this.detectOverlaps()

    if (
      overlaps.length === 0 ||
      this.resolveIterations >= this.MAX_RESOLVE_ITERATIONS
    ) {
      // Final pass: re-center the layout around origin
      this.recenterLayout()
      this.solved = true
      return
    }

    this.applyForces(overlaps)
    this.resolveIterations++
  }

  private getChipBounds(chipId: string): ChipBounds | null {
    const placement = this.resolvedLayout!.chipPlacements[chipId]
    const chip = this.inputProblem.chipMap[chipId]
    if (!placement || !chip) return null

    const rot = placement.ccwRotationDegrees || 0
    let w = chip.size.x
    let h = chip.size.y
    if (rot === 90 || rot === 270) {
      ;[w, h] = [h, w]
    }

    const halfW = w / 2
    const halfH = h / 2

    return {
      chipId,
      minX: placement.x - halfW,
      maxX: placement.x + halfW,
      minY: placement.y - halfH,
      maxY: placement.y + halfH,
      cx: placement.x,
      cy: placement.y,
    }
  }

  private detectOverlaps(): Array<{
    chip1: string
    chip2: string
    overlapX: number
    overlapY: number
  }> {
    const overlaps: Array<{
      chip1: string
      chip2: string
      overlapX: number
      overlapY: number
    }> = []

    const chipIds = Object.keys(this.resolvedLayout!.chipPlacements)
    const sep = this.MIN_SEPARATION

    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const b1 = this.getChipBounds(chipIds[i]!)
        const b2 = this.getChipBounds(chipIds[j]!)
        if (!b1 || !b2) continue

        const adjustedOverlapX =
          Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX) + sep
        const adjustedOverlapY =
          Math.min(b1.maxY, b2.maxY) - Math.max(b1.minY, b2.minY) + sep

        if (adjustedOverlapX > 0 && adjustedOverlapY > 0) {
          overlaps.push({
            chip1: chipIds[i]!,
            chip2: chipIds[j]!,
            overlapX: adjustedOverlapX,
            overlapY: adjustedOverlapY,
          })
        }
      }
    }

    return overlaps
  }

  private getConnectedChipPairs(): Set<string> {
    if (this.connectedPairsCache) return this.connectedPairsCache

    const pairs = new Set<string>()

    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [pin1, pin2] = connKey.split("-")
      if (!pin1 || !pin2) continue

      let chip1: string | null = null
      let chip2: string | null = null

      for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
        if (chip.pins.includes(pin1)) chip1 = chipId
        if (chip.pins.includes(pin2)) chip2 = chipId
      }

      if (chip1 && chip2 && chip1 !== chip2) {
        const key = chip1 < chip2 ? `${chip1}-${chip2}` : `${chip2}-${chip1}`
        pairs.add(key)
      }
    }

    this.connectedPairsCache = pairs
    return pairs
  }

  /** Build a map of chipId -> set of netIds the chip connects to */
  private getChipNets(): Map<string, Set<string>> {
    if (this.chipNetCache) return this.chipNetCache

    const chipNets = new Map<string, Set<string>>()

    for (const [connKey, connected] of Object.entries(
      this.inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const [pinId, netId] = connKey.split("-")
      if (!pinId || !netId) continue

      // Find which chip owns this pin
      for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
        if (chip.pins.includes(pinId)) {
          if (!chipNets.has(chipId)) chipNets.set(chipId, new Set())
          chipNets.get(chipId)!.add(netId)
          break
        }
      }
    }

    this.chipNetCache = chipNets
    return chipNets
  }

  /** Determine voltage bias direction for a chip based on its net connections */
  private getVoltageBias(chipId: string): number {
    const chipNets = this.getChipNets()
    const nets = chipNets.get(chipId)
    if (!nets) return 0

    let bias = 0
    for (const netId of nets) {
      const net = this.inputProblem.netMap[netId]
      if (!net) continue
      // Positive voltage sources should be biased upward (positive Y)
      if (net.isPositiveVoltageSource) bias += 1
      // Ground should be biased downward (negative Y)
      if (net.isGround) bias -= 1
    }

    return bias
  }

  private applyForces(
    overlaps: Array<{
      chip1: string
      chip2: string
      overlapX: number
      overlapY: number
    }>,
  ) {
    const forces: Record<string, { fx: number; fy: number }> = {}

    for (const chipId of Object.keys(this.resolvedLayout!.chipPlacements)) {
      forces[chipId] = { fx: 0, fy: 0 }
    }

    // 1. Repulsion forces for overlapping chips
    for (const overlap of overlaps) {
      const p1 = this.resolvedLayout!.chipPlacements[overlap.chip1]!
      const p2 = this.resolvedLayout!.chipPlacements[overlap.chip2]!

      let dx = p2.x - p1.x
      let dy = p2.y - p1.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 0.001) {
        dx = 1
        dy = 0
      } else {
        dx /= dist
        dy /= dist
      }

      const pushX = overlap.overlapX * this.REPULSION_STRENGTH
      const pushY = overlap.overlapY * this.REPULSION_STRENGTH

      if (overlap.overlapX < overlap.overlapY) {
        const sign = dx >= 0 ? 1 : -1
        forces[overlap.chip1]!.fx -= (pushX / 2) * sign
        forces[overlap.chip2]!.fx += (pushX / 2) * sign
      } else {
        const sign = dy >= 0 ? 1 : -1
        forces[overlap.chip1]!.fy -= (pushY / 2) * sign
        forces[overlap.chip2]!.fy += (pushY / 2) * sign
      }
    }

    // 2. Attraction forces for connected chips (keep layout compact)
    const connectedPairs = this.getConnectedChipPairs()
    for (const pairKey of connectedPairs) {
      const [c1, c2] = pairKey.split("-")
      const p1 = this.resolvedLayout!.chipPlacements[c1!]
      const p2 = this.resolvedLayout!.chipPlacements[c2!]
      if (!p1 || !p2) continue

      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > this.MIN_SEPARATION * 3) {
        const attractX = dx * this.ATTRACTION_STRENGTH
        const attractY = dy * this.ATTRACTION_STRENGTH
        if (forces[c1!]) {
          forces[c1!].fx += attractX
          forces[c1!].fy += attractY
        }
        if (forces[c2!]) {
          forces[c2!].fx -= attractX
          forces[c2!].fy -= attractY
        }
      }
    }

    // 3. Voltage-aware biasing: push chips toward conventional positions
    //    VCC-connected chips biased upward, GND-connected chips biased downward
    for (const chipId of Object.keys(this.resolvedLayout!.chipPlacements)) {
      const bias = this.getVoltageBias(chipId)
      if (bias !== 0 && forces[chipId]) {
        forces[chipId].fy += bias * this.VOLTAGE_BIAS_STRENGTH
      }
    }

    // Apply forces with damping that increases over iterations for convergence
    const damping = Math.max(
      0.3,
      1.0 - this.resolveIterations / this.MAX_RESOLVE_ITERATIONS,
    )
    for (const [chipId, force] of Object.entries(forces)) {
      const placement = this.resolvedLayout!.chipPlacements[chipId]
      if (!placement) continue
      placement.x += force.fx * damping
      placement.y += force.fy * damping
    }
  }

  /** Re-center the layout so the bounding box center is at the origin */
  private recenterLayout() {
    if (!this.resolvedLayout) return

    const chipIds = Object.keys(this.resolvedLayout.chipPlacements)
    if (chipIds.length === 0) return

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const chipId of chipIds) {
      const bounds = this.getChipBounds(chipId)
      if (!bounds) continue
      minX = Math.min(minX, bounds.minX)
      maxX = Math.max(maxX, bounds.maxX)
      minY = Math.min(minY, bounds.minY)
      maxY = Math.max(maxY, bounds.maxY)
    }

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    for (const chipId of chipIds) {
      const placement = this.resolvedLayout.chipPlacements[chipId]
      if (!placement) continue
      placement.x -= centerX
      placement.y -= centerY
    }
  }

  getOutputLayout(): OutputLayout {
    if (!this.resolvedLayout) {
      throw new Error("OverlapResolutionSolver not solved yet")
    }
    return this.resolvedLayout
  }

  override visualize(): GraphicsObject {
    const layout = this.resolvedLayout || this.layout
    return visualizeInputProblem(this.inputProblem, layout)
  }

  override getConstructorParams() {
    return [{ inputProblem: this.inputProblem, layout: this.layout }]
  }
}
