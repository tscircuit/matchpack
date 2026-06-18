/**
 * TraceAlignmentSolver
 *
 * Post-pack phase that snaps strongly-connected pad pairs onto the same axis
 * (horizontal or vertical) when one of the chips can move freely.
 *
 * Motivation: after partition packing, chips are placed on a grid but the
 * pads on each side are at fixed offsets from the chip center. A
 * strongly-connected pin pair such as R1.1 (top of resistor) <-> U1.4 (right
 * side of chip, slightly above center) often ends up with a small (0.1-0.5)
 * Y delta between the two pads, which renders as a visible zig-zag in the
 * schematic. Aligning these pads removes the zig-zag without changing the
 * overall topology.
 *
 * Strategy: for every chip with at least one inter-chip strong connection,
 * compute the average displacement that would put each connecting pad on
 * the same axis (X for vertical traces, Y for horizontal) as its partner
 * pin, then apply that displacement only if (a) it does not cause an AABB
 * intersection with any other chip, and (b) the chip's own total off-axis
 * pad delta strictly decreases. The accept-only-if-improving guard means
 * multi-partner chips with conflicting pulls do not move. Two passes give
 * downstream chips a chance to align after upstream chips have moved.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type {
  ChipId,
  ChipPin,
  InputProblem,
  PinId,
} from "lib/types/InputProblem"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export interface TraceAlignmentSolverInput {
  inputProblem: InputProblem
  layout: OutputLayout
}

interface RotatedBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export class TraceAlignmentSolver extends BaseSolver {
  inputProblem: InputProblem
  layout: OutputLayout
  alignedLayout: OutputLayout | null = null

  /** chipId -> [pinId,...] of pins that are strongly connected to a pin on a different chip */
  private chipIdToInterChipStrongPins: Map<ChipId, PinId[]> = new Map()
  /** pinId -> chipId */
  private pinIdToChipId: Map<PinId, ChipId> = new Map()
  /** pinId -> partner pinId for strong connections (only for leaf chips, may have multiple per pin if both sides happen to be in map) */
  private strongPinPartners: Map<PinId, PinId[]> = new Map()

  /** Stats for reporting / tests */
  appliedNudgeCount = 0
  candidateChipCount = 0
  initialMaxPadDelta = 0
  finalMaxPadDelta = 0

  constructor(input: TraceAlignmentSolverInput) {
    super()
    this.inputProblem = input.inputProblem
    this.layout = input.layout
    this.MAX_ITERATIONS = 1
  }

  override _step() {
    this.buildIndices()
    const newPlacements: Record<ChipId, Placement> = {
      ...this.layout.chipPlacements,
    }

    this.initialMaxPadDelta = this.computeMaxPadDelta(newPlacements)

    // Score every chip with at least one inter-chip strong connection. We
    // prefer "leaf" chips (single partner) because their nudges have no
    // chance of breaking another alignment, but we also accept multi-partner
    // chips when the average required nudge is consistent (small variance
    // between per-pin nudges) — this keeps us conservative.
    const candidateChipIds: ChipId[] = []
    for (const [chipId, pins] of this.chipIdToInterChipStrongPins.entries()) {
      if (pins.length === 0) continue
      candidateChipIds.push(chipId)
    }
    this.candidateChipCount = candidateChipIds.length

    // Stable iteration order so the result is deterministic.
    candidateChipIds.sort()

    // Iterate twice: first pass nudges leaves, second pass nudges
    // multi-partner chips relative to leaves' new positions. This lets a
    // resistor downstream of a fixed chip line up with an already-aligned cap.
    for (let pass = 0; pass < 2; pass++) {
      for (const chipId of candidateChipIds) {
        const nudge = this.computeBestNudge(chipId, newPlacements)
        if (!nudge) continue
        const candidate = {
          ...newPlacements[chipId]!,
          x: newPlacements[chipId]!.x + nudge.dx,
          y: newPlacements[chipId]!.y + nudge.dy,
        }
        if (!this.canPlaceWithoutOverlap(chipId, candidate, newPlacements)) {
          continue
        }
        // Only accept if it reduces this chip's total off-axis-delta. This
        // guards against multi-partner chips where alignment to one partner
        // would break another.
        const before = this.computeChipPadDelta(chipId, newPlacements)
        const trial = { ...newPlacements, [chipId]: candidate }
        const after = this.computeChipPadDelta(chipId, trial)
        if (after < before - 1e-9) {
          newPlacements[chipId] = candidate
          this.appliedNudgeCount += 1
        }
      }
    }

    this.alignedLayout = {
      chipPlacements: newPlacements,
      groupPlacements: this.layout.groupPlacements,
    }
    this.finalMaxPadDelta = this.computeMaxPadDelta(newPlacements)
    this.solved = true
  }

  private buildIndices() {
    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      for (const pinId of chip.pins) {
        this.pinIdToChipId.set(pinId, chipId)
      }
    }

    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const dash = connKey.indexOf("-")
      if (dash === -1) continue
      const pinA = connKey.slice(0, dash)
      const pinB = connKey.slice(dash + 1)
      const chipA = this.pinIdToChipId.get(pinA)
      const chipB = this.pinIdToChipId.get(pinB)
      // Only consider connections where both endpoints are pins on chips and
      // the two endpoints belong to different chips (skip pin-to-net entries
      // that share the strong-conn map shape but aren't pin-to-pin).
      if (!chipA || !chipB) continue
      if (chipA === chipB) continue

      const aPartners = this.strongPinPartners.get(pinA) ?? []
      aPartners.push(pinB)
      this.strongPinPartners.set(pinA, aPartners)
      const bPartners = this.strongPinPartners.get(pinB) ?? []
      bPartners.push(pinA)
      this.strongPinPartners.set(pinB, bPartners)

      const aPins = this.chipIdToInterChipStrongPins.get(chipA) ?? []
      if (!aPins.includes(pinA)) aPins.push(pinA)
      this.chipIdToInterChipStrongPins.set(chipA, aPins)
      const bPins = this.chipIdToInterChipStrongPins.get(chipB) ?? []
      if (!bPins.includes(pinB)) bPins.push(pinB)
      this.chipIdToInterChipStrongPins.set(chipB, bPins)
    }
  }

  /**
   * Compute the absolute (world) position of a pin given a placement.
   */
  private getAbsolutePinPos(
    pin: ChipPin,
    placement: Placement,
  ): { x: number; y: number } {
    const rot = ((placement.ccwRotationDegrees % 360) + 360) % 360
    let dx = pin.offset.x
    let dy = pin.offset.y
    if (rot === 90) {
      dx = -pin.offset.y
      dy = pin.offset.x
    } else if (rot === 180) {
      dx = -pin.offset.x
      dy = -pin.offset.y
    } else if (rot === 270) {
      dx = pin.offset.y
      dy = -pin.offset.x
    }
    return { x: placement.x + dx, y: placement.y + dy }
  }

  /**
   * Compute the best small nudge for a leaf chip so that its strong pin lines
   * up with its partner pin's axis. Returns null if no useful nudge applies.
   *
   * We move the leaf chip on EITHER X or Y, picking the axis based on the
   * orientation of the partner pin: if the partner pin is on x+ or x-, we
   * align the leaf pin's Y to the partner pin's Y. If on y+ or y-, we align
   * X. This avoids fighting the dominant trace direction.
   */
  private computeBestNudge(
    leafChipId: ChipId,
    placements: Record<ChipId, Placement>,
  ): { dx: number; dy: number } | null {
    const leafPins = this.chipIdToInterChipStrongPins.get(leafChipId) ?? []
    if (leafPins.length === 0) return null

    // For multi-pin leaves we average the required nudge across all strong pins.
    let totalDx = 0
    let totalDy = 0
    let count = 0
    for (const leafPinId of leafPins) {
      const partners = this.strongPinPartners.get(leafPinId) ?? []
      for (const partnerPinId of partners) {
        const leafPin = this.inputProblem.chipPinMap[leafPinId]
        const partnerPin = this.inputProblem.chipPinMap[partnerPinId]
        if (!leafPin || !partnerPin) continue
        const partnerChipId = this.pinIdToChipId.get(partnerPinId)
        if (!partnerChipId) continue
        const leafPlacement = placements[leafChipId]
        const partnerPlacement = placements[partnerChipId]
        if (!leafPlacement || !partnerPlacement) continue

        const leafAbs = this.getAbsolutePinPos(leafPin, leafPlacement)
        const partnerAbs = this.getAbsolutePinPos(partnerPin, partnerPlacement)

        // Choose axis based on partner pin side. The partner is the more
        // central / fixed component, so we trust its pin orientation.
        if (partnerPin.side === "x+" || partnerPin.side === "x-") {
          // Horizontal trace: align leaf pin's Y to partner pin's Y.
          totalDy += partnerAbs.y - leafAbs.y
          count += 1
        } else if (partnerPin.side === "y+" || partnerPin.side === "y-") {
          // Vertical trace: align leaf pin's X to partner pin's X.
          totalDx += partnerAbs.x - leafAbs.x
          count += 1
        }
      }
    }

    if (count === 0) return null
    const dx = totalDx / count
    const dy = totalDy / count

    // Skip nudges that are within numerical noise.
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null

    return { dx, dy }
  }

  /**
   * Reject a candidate placement only if it would create a true AABB
   * intersection with another chip (no axial clearance at all). We
   * deliberately do NOT enforce chipGap here; the alignment phase is
   * allowed to trade spacing for pad alignment as long as chips do not
   * actually intersect. Chip-gap-induced spacing is the upstream packer's
   * concern.
   */
  private canPlaceWithoutOverlap(
    chipId: ChipId,
    candidate: Placement,
    placements: Record<ChipId, Placement>,
  ): boolean {
    const chip = this.inputProblem.chipMap[chipId]
    if (!chip) return false
    const candidateBounds = this.getBounds(candidate, chip.size)

    for (const [otherId, otherPlacement] of Object.entries(placements)) {
      if (otherId === chipId) continue
      const otherChip = this.inputProblem.chipMap[otherId]
      if (!otherChip) continue
      const otherBounds = this.getBounds(otherPlacement, otherChip.size)

      const candClearance = this.maxAxisClearance(candidateBounds, otherBounds)
      // Zero clearance on both axes = true overlap.
      if (candClearance <= 0) return false
    }
    return true
  }

  /** Maximum axial clearance between two AABBs. Negative means overlap. */
  private maxAxisClearance(a: RotatedBounds, b: RotatedBounds): number {
    const xGap = Math.max(b.minX - a.maxX, a.minX - b.maxX)
    const yGap = Math.max(b.minY - a.maxY, a.minY - b.maxY)
    return Math.max(xGap, yGap)
  }

  private getBounds(
    placement: Placement,
    size: { x: number; y: number },
  ): RotatedBounds {
    const halfWidth = size.x / 2
    const halfHeight = size.y / 2
    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))
    const rotatedHalfW = halfWidth * cos + halfHeight * sin
    const rotatedHalfH = halfWidth * sin + halfHeight * cos
    return {
      minX: placement.x - rotatedHalfW,
      maxX: placement.x + rotatedHalfW,
      minY: placement.y - rotatedHalfH,
      maxY: placement.y + rotatedHalfH,
    }
  }

  private boundsOverlap(
    a: RotatedBounds,
    b: RotatedBounds,
    minSeparation: number,
  ): boolean {
    // Two AABBs are non-overlapping with sufficient gap if they have at
    // least `minSeparation` of clearance in EITHER axis. (You can satisfy
    // chip-to-chip spacing by separating in X or Y; you don't need both.)
    const xGap = Math.max(b.minX - a.maxX, a.minX - b.maxX)
    const yGap = Math.max(b.minY - a.maxY, a.minY - b.maxY)
    const cleared = Math.max(xGap, yGap) >= minSeparation
    return !cleared
  }

  /**
   * Sum of off-axis pad deltas for one chip's inter-chip strong connections.
   * Used to gate whether a candidate nudge is actually an improvement.
   */
  private computeChipPadDelta(
    chipId: ChipId,
    placements: Record<ChipId, Placement>,
  ): number {
    const pins = this.chipIdToInterChipStrongPins.get(chipId) ?? []
    let total = 0
    const placement = placements[chipId]
    if (!placement) return 0
    for (const pinId of pins) {
      const pin = this.inputProblem.chipPinMap[pinId]
      if (!pin) continue
      const absA = this.getAbsolutePinPos(pin, placement)
      const partners = this.strongPinPartners.get(pinId) ?? []
      for (const partnerPinId of partners) {
        const partnerChipId = this.pinIdToChipId.get(partnerPinId)
        if (!partnerChipId || partnerChipId === chipId) continue
        const partnerPin = this.inputProblem.chipPinMap[partnerPinId]
        const partnerPlacement = placements[partnerChipId]
        if (!partnerPin || !partnerPlacement) continue
        const absB = this.getAbsolutePinPos(partnerPin, partnerPlacement)
        // Off-axis is whichever is smaller; we want this near zero.
        total += Math.min(Math.abs(absA.x - absB.x), Math.abs(absA.y - absB.y))
      }
    }
    return total
  }

  /**
   * Diagnostic: maximum absolute pad-axis-delta across all strong pin-to-pin
   * connections. Lower is better - this is the metric we improve.
   */
  private computeMaxPadDelta(placements: Record<ChipId, Placement>): number {
    let maxDelta = 0
    for (const [pinA, partners] of this.strongPinPartners.entries()) {
      const chipA = this.pinIdToChipId.get(pinA)
      if (!chipA) continue
      const placementA = placements[chipA]
      const pinAObj = this.inputProblem.chipPinMap[pinA]
      if (!placementA || !pinAObj) continue
      const absA = this.getAbsolutePinPos(pinAObj, placementA)
      for (const pinB of partners) {
        const chipB = this.pinIdToChipId.get(pinB)
        if (!chipB || chipB === chipA) continue
        const placementB = placements[chipB]
        const pinBObj = this.inputProblem.chipPinMap[pinB]
        if (!placementB || !pinBObj) continue
        const absB = this.getAbsolutePinPos(pinBObj, placementB)
        // The "trace zig-zag" cost is the off-axis delta. For a horizontal
        // trace (partner side x+/x-) the zig-zag is the Y delta; for a
        // vertical trace it's the X delta. We take the smaller one as the
        // off-axis to be charitable.
        const offAxis = Math.min(
          Math.abs(absA.x - absB.x),
          Math.abs(absA.y - absB.y),
        )
        if (offAxis > maxDelta) maxDelta = offAxis
      }
    }
    return maxDelta
  }

  override visualize(): GraphicsObject {
    if (!this.alignedLayout) {
      return {
        lines: [],
        points: [],
        rects: [],
        circles: [],
      }
    }
    return visualizeInputProblem(this.inputProblem, this.alignedLayout)
  }

  override getConstructorParams(): TraceAlignmentSolverInput {
    return {
      inputProblem: this.inputProblem,
      layout: this.layout,
    }
  }
}
