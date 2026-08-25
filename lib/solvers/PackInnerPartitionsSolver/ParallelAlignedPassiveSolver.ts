/**
 * Inner-partition layout solver for a partition that contains a same-side passive
 * group (see findSameSidePassiveGroups) — e.g. the BQ24074's R1/R2/R3 attached to
 * U1's bottom (ITERM/ILIM/ISET) or right (EN2/EN1/TMR) edge.
 *
 * It runs the normal calculate-packing layout (via SingleInnerPartitionPackingSolver)
 * and then re-flows ONLY the detected group(s) into a clean, evenly-spaced
 * horizontal row just outside the main-chip edge — pushed left/right/up/down
 * depending on which edge the group attaches to — ordered by the connecting
 * main-chip pin and kept at least chipGap from neighbouring components. Every
 * other component stays exactly where calculate-packing placed it, and each
 * passive keeps its (fixed, typically vertical) rotation.
 *
 * Sibling to SingleInnerPartitionPackingSolver; PackInnerPartitionsSolver
 * dispatches to it by partition contents. If a group cannot be re-flowed cleanly
 * it is left at its packed position, so the result is never worse.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  ChipId,
  ChipPin,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { Side } from "../../types/Side"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import {
  findSameSidePassiveGroups,
  type SameSidePassiveGroup,
} from "./findSameSidePassiveGroups"
import { SingleInnerPartitionPackingSolver } from "./SingleInnerPartitionPackingSolver"
import {
  type Bounds,
  boundsDistance,
  doBoundsOverlap,
  getBoundsCenter,
  getBoundsFromPoints,
} from "@tscircuit/math-utils"
import { applyDirectPassiveTraceClearance } from "../../utils/offsetCollinearConnections"

const CLEARANCE_EPSILON = 1e-6
const MAX_RESOLVE_ITERATIONS = 16

const signWithEpsilon = (value: number): -1 | 0 | 1 => {
  if (value > CLEARANCE_EPSILON) return 1
  if (value < -CLEARANCE_EPSILON) return -1
  return 0
}

/** Outward unit vector (main-chip centre → edge) for each side. */
const OUTWARD_BY_SIDE: Record<Side, { x: number; y: number }> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

const sideForRotatedOffset = (offset: { x: number; y: number }): Side => {
  if (Math.abs(offset.x) >= Math.abs(offset.y)) {
    if (offset.x >= 0) return "x+"
    return "x-"
  }
  if (offset.y >= 0) return "y+"
  return "y-"
}

const edgeCoordForSide = (
  offset: { x: number; y: number },
  side: Side,
): number => {
  if (side === "x-" || side === "x+") return offset.y
  return offset.x
}

type RailCarrierLayoutItem = {
  chipId: ChipId
  passiveCarrierPinId: PinId
  carrierPinId: PinId
}

/** Gap between two bounds along a single axis (0 if they overlap on that axis). */
const axisGap = (a: Bounds, b: Bounds, axis: "x" | "y"): number => {
  if (axis === "x") return Math.max(0, a.minX - b.maxX, b.minX - a.maxX)
  return Math.max(0, a.minY - b.maxY, b.minY - a.maxY)
}

export class ParallelAlignedPassiveSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  declare activeSubSolver: SingleInnerPartitionPackingSolver | null

  private packingSolver: SingleInnerPartitionPackingSolver | null = null

  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.pinIdToStronglyConnectedPins = params.pinIdToStronglyConnectedPins
  }

  override _step() {
    // Run the normal packer first; the group re-flow is layered on top of it.
    if (!this.packingSolver) {
      this.packingSolver = new SingleInnerPartitionPackingSolver({
        partitionInputProblem: this.partitionInputProblem,
        pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
      })
      this.activeSubSolver = this.packingSolver
    }

    this.packingSolver.step()

    if (this.packingSolver.failed) {
      this.failed = true
      this.error = this.packingSolver.error
      return
    }

    if (this.packingSolver.solved && this.packingSolver.layout) {
      this.layout = this.alignPassiveGroups(this.packingSolver.layout)
      this.activeSubSolver = null
      this.solved = true
    }
  }

  private alignPassiveGroups(base: OutputLayout): OutputLayout {
    const placements: Record<ChipId, Placement> = {}
    for (const [chipId, placement] of Object.entries(base.chipPlacements)) {
      placements[chipId] = { ...placement }
    }
    const passiveGroups = findSameSidePassiveGroups(this.partitionInputProblem)
    for (const passiveGroup of passiveGroups) {
      if (passiveGroup.railCarrier) {
        this.reflowRailCarrierPassiveGroup(placements, passiveGroup)
      } else {
        this.reflowPassiveGroup(placements, passiveGroup)
      }
    }
    applyDirectPassiveTraceClearance({
      inputProblem: this.partitionInputProblem,
      connectedPinsByPinId: this.pinIdToStronglyConnectedPins,
      chipPlacements: placements,
      rigidChipGroups: passiveGroups.map((passiveGroup) => [
        ...passiveGroup.passiveChipIds,
        ...(passiveGroup.railCarrier
          ? [passiveGroup.railCarrier.carrierChipId]
          : []),
      ]),
    })
    return { chipPlacements: placements, groupPlacements: base.groupPlacements }
  }

  private reflowRailCarrierPassiveGroup(
    placements: Record<ChipId, Placement>,
    passiveGroup: SameSidePassiveGroup,
  ): void {
    const railCarrier = passiveGroup.railCarrier
    if (!railCarrier) return

    const prob = this.partitionInputProblem
    const gap = prob.chipGap
    const mainChipPlacement = placements[passiveGroup.mainChipId]
    const carrierPlacement = placements[railCarrier.carrierChipId]
    if (!mainChipPlacement || !carrierPlacement) return

    const ordered = passiveGroup.passiveChipIds.map((chipId, index) => {
      const mainPinId = passiveGroup.mainChipPinIds[index]
      const mainPin = mainPinId && prob.chipPinMap[mainPinId]
      const passiveMainPinId = railCarrier.passiveMainPinIds[index]
      const passiveCarrierPinId = railCarrier.passiveCarrierPinIds[index]
      const carrierPinId = railCarrier.carrierPinIds[index]
      if (
        !mainPinId ||
        !mainPin ||
        !passiveMainPinId ||
        !passiveCarrierPinId ||
        !carrierPinId
      ) {
        return null
      }
      const rotatedOffset = rotatePinOffset(
        mainPin.offset,
        mainChipPlacement.ccwRotationDegrees,
      )
      const side = sideForRotatedOffset(rotatedOffset)
      return {
        chipId,
        mainPinId,
        passiveMainPinId,
        passiveCarrierPinId,
        carrierPinId,
        side,
        edgeCoord: edgeCoordForSide(rotatedOffset, side),
      }
    })
    if (ordered.length !== 2 || ordered.some((entry) => entry === null)) return
    const side = ordered[0]!.side
    if (ordered.some((entry) => entry!.side !== side)) return
    ordered.sort((a, b) => a!.edgeCoord - b!.edgeCoord)

    const outward = OUTWARD_BY_SIDE[side]
    const outwardAxis: "x" | "y" = outward.x === 0 ? "y" : "x"
    const alignAxis: "x" | "y" = outwardAxis === "x" ? "y" : "x"
    const mainChipBox = this.boxFor(passiveGroup.mainChipId, mainChipPlacement)
    const candidatePlacements: Record<ChipId, Placement> = {}

    for (const [index, item] of ordered.entries()) {
      const passiveChip = prob.chipMap[item!.chipId]
      const packedPlacement = placements[item!.chipId]
      if (!passiveChip || !packedPlacement) return
      const mainPinPosition = this.pinPosition(
        passiveGroup.mainChipId,
        item!.mainPinId,
        mainChipPlacement,
      )
      const passiveMainPin = prob.chipPinMap[item!.passiveMainPinId]
      if (!mainPinPosition || !passiveMainPin) return

      const passiveSize = getRotatedSize(
        passiveChip.size,
        packedPlacement.ccwRotationDegrees,
      )
      const passiveMainPinOffset = rotatePinOffset(
        passiveMainPin.offset,
        packedPlacement.ccwRotationDegrees,
      )
      const nextPlacement: Placement = {
        ...packedPlacement,
        [alignAxis]:
          mainPinPosition[alignAxis] - passiveMainPinOffset[alignAxis],
      }
      if (side === "x+") {
        nextPlacement.x = mainChipBox.maxX + gap + passiveSize.x / 2
      } else if (side === "x-") {
        nextPlacement.x = mainChipBox.minX - gap - passiveSize.x / 2
      } else if (side === "y+") {
        nextPlacement.y = mainChipBox.maxY + gap + passiveSize.y / 2
      } else {
        nextPlacement.y = mainChipBox.minY - gap - passiveSize.y / 2
      }
      candidatePlacements[item!.chipId] = nextPlacement
      if (index === 1) {
        const previousChipId = ordered[0]!.chipId
        const previousBounds = this.boxFor(
          previousChipId,
          candidatePlacements[previousChipId]!,
        )
        const bounds = this.boxFor(item!.chipId, nextPlacement)
        if (boundsDistance(bounds, previousBounds) < gap - CLEARANCE_EPSILON) {
          const crossGap = axisGap(bounds, previousBounds, alignAxis)
          const neededGap = Math.sqrt(
            Math.max(0, gap * gap - crossGap * crossGap),
          )
          let adjustment: number
          if (outwardAxis === "x" && outward.x > 0) {
            adjustment = previousBounds.maxX - bounds.minX + neededGap
          } else if (outwardAxis === "x") {
            adjustment = bounds.maxX - previousBounds.minX + neededGap
          } else if (outward.y > 0) {
            adjustment = previousBounds.maxY - bounds.minY + neededGap
          } else {
            adjustment = bounds.maxY - previousBounds.minY + neededGap
          }
          nextPlacement[outwardAxis] +=
            outward[outwardAxis] * (adjustment + CLEARANCE_EPSILON)
        }
      }
    }

    const carrierCandidate = this.getUniqueRailCarrierPlacement({
      candidatePlacements,
      carrierChipId: railCarrier.carrierChipId,
      items: ordered as RailCarrierLayoutItem[],
      side,
      baseCarrierPlacement: carrierPlacement,
      alignAxis,
    })
    if (!carrierCandidate) return

    const movedChipIds = [
      ...ordered.map((item) => item!.chipId),
      railCarrier.carrierChipId,
    ]
    const completeCandidatePlacements = {
      ...candidatePlacements,
      [railCarrier.carrierChipId]: carrierCandidate,
    }
    if (
      this.hasChipGapViolationAfterMove(
        completeCandidatePlacements,
        placements,
        movedChipIds,
        gap,
      )
    ) {
      return
    }

    for (const chipId of movedChipIds) {
      placements[chipId] = completeCandidatePlacements[chipId]!
    }
  }

  private getUniqueRailCarrierPlacement({
    candidatePlacements,
    carrierChipId,
    items,
    side,
    baseCarrierPlacement,
    alignAxis,
  }: {
    candidatePlacements: Record<ChipId, Placement>
    carrierChipId: ChipId
    items: RailCarrierLayoutItem[]
    side: Side
    baseCarrierPlacement: Placement
    alignAxis: "x" | "y"
  }): Placement | null {
    const prob = this.partitionInputProblem
    const carrierChip = prob.chipMap[carrierChipId]
    if (!carrierChip || items.length !== 2) return null

    const passiveBounds = getBoundsFromPoints(
      items.flatMap((item) => {
        const bounds = this.boxFor(
          item.chipId,
          candidatePlacements[item.chipId]!,
        )
        return [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
        ]
      }),
    )
    if (!passiveBounds) return null

    const rotations = [
      ...new Set(
        carrierChip.availableRotations ?? [
          baseCarrierPlacement.ccwRotationDegrees,
        ],
      ),
    ]
    const compatiblePlacements: Placement[] = []

    for (const ccwRotationDegrees of rotations) {
      const offsets = items.map((item) => {
        const passivePlacement = candidatePlacements[item.chipId]
        const passivePin = prob.chipPinMap[item.passiveCarrierPinId]
        const carrierPin = prob.chipPinMap[item.carrierPinId]
        if (!passivePlacement || !passivePin || !carrierPin) return null
        const passivePinOffset = rotatePinOffset(
          passivePin.offset,
          passivePlacement.ccwRotationDegrees,
        )
        const carrierPinOffset = rotatePinOffset(
          carrierPin.offset,
          ccwRotationDegrees,
        )
        return {
          passivePinPosition: {
            x: passivePlacement.x + passivePinOffset.x,
            y: passivePlacement.y + passivePinOffset.y,
          },
          carrierPinOffset,
        }
      })
      if (offsets.some((offset) => offset === null)) continue
      const firstOffset = offsets[0]!
      const secondOffset = offsets[1]!
      const passiveDirection = signWithEpsilon(
        secondOffset.passivePinPosition[alignAxis] -
          firstOffset.passivePinPosition[alignAxis],
      )
      const carrierDirection = signWithEpsilon(
        secondOffset.carrierPinOffset[alignAxis] -
          firstOffset.carrierPinOffset[alignAxis],
      )
      if (passiveDirection === 0 || passiveDirection !== carrierDirection) {
        continue
      }

      const alignCoordinate =
        offsets.reduce(
          (sum, offset) =>
            sum +
            offset!.passivePinPosition[alignAxis] -
            offset!.carrierPinOffset[alignAxis],
          0,
        ) / offsets.length

      const carrierSize = getRotatedSize(carrierChip.size, ccwRotationDegrees)
      const placement: Placement = {
        x: baseCarrierPlacement.x,
        y: baseCarrierPlacement.y,
        ccwRotationDegrees,
        [alignAxis]: alignCoordinate,
      }
      if (side === "x+") {
        placement.x =
          passiveBounds.maxX +
          this.partitionInputProblem.chipGap +
          carrierSize.x / 2
      } else if (side === "x-") {
        placement.x =
          passiveBounds.minX -
          this.partitionInputProblem.chipGap -
          carrierSize.x / 2
      } else if (side === "y+") {
        placement.y =
          passiveBounds.maxY +
          this.partitionInputProblem.chipGap +
          carrierSize.y / 2
      } else {
        placement.y =
          passiveBounds.minY -
          this.partitionInputProblem.chipGap -
          carrierSize.y / 2
      }

      compatiblePlacements.push(placement)
    }

    return compatiblePlacements.length === 1 ? compatiblePlacements[0]! : null
  }

  private hasChipGapViolationAfterMove(
    candidatePlacements: Record<ChipId, Placement>,
    placements: Record<ChipId, Placement>,
    movedChipIds: ChipId[],
    gap: number,
  ): boolean {
    const nextPlacements = { ...placements, ...candidatePlacements }

    for (let i = 0; i < movedChipIds.length; i++) {
      const chipId = movedChipIds[i]!
      const bounds = this.boxFor(chipId, nextPlacements[chipId]!)

      for (const [otherChipId, otherPlacement] of Object.entries(
        nextPlacements,
      )) {
        if (otherChipId === chipId) continue
        const otherBounds = this.boxFor(otherChipId, otherPlacement)
        if (doBoundsOverlap(bounds, otherBounds)) return true
        if (boundsDistance(bounds, otherBounds) < gap - CLEARANCE_EPSILON) {
          return true
        }
      }
    }
    return false
  }

  private pinPosition(
    _chipId: ChipId,
    pinId: PinId,
    placement: Placement,
  ): { x: number; y: number } | null {
    const pin = this.partitionInputProblem.chipPinMap[pinId]
    if (!pin) return null
    const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
    return {
      x: placement.x + offset.x,
      y: placement.y + offset.y,
    }
  }

  private reflowPassiveGroup(
    placements: Record<ChipId, Placement>,
    passiveGroup: SameSidePassiveGroup,
  ): void {
    const prob = this.partitionInputProblem
    const gap = prob.chipGap
    const mainChipPlacement = placements[passiveGroup.mainChipId]
    if (!mainChipPlacement) return

    // Outward direction from the main-chip centre to the edge this group attaches
    // to. A left/right edge means the row is pushed along x ("horizontal" side).
    const outward = OUTWARD_BY_SIDE[passiveGroup.side]
    const sideIsHorizontal = outward.x !== 0

    // Pin-inclusive main-chip box, so the group clears main-chip pins that
    // protrude past the body (e.g. U1's left/right pins reach beyond the body).
    const mainChipBox = this.boxFor(passiveGroup.mainChipId, mainChipPlacement)
    const mainChipCenter = getBoundsCenter(mainChipBox)

    // Centroid of the main-chip pins this group connects to, so the row lines up
    // with the connection region.
    const mainChipPinPositions = passiveGroup.mainChipPinIds.map((pinId) => {
      const rotatedOffset = rotatePinOffset(
        prob.chipPinMap[pinId]!.offset,
        mainChipPlacement.ccwRotationDegrees,
      )
      return {
        x: mainChipPlacement.x + rotatedOffset.x,
        y: mainChipPlacement.y + rotatedOffset.y,
      }
    })
    let mainChipPinCentroid = mainChipCenter
    if (mainChipPinPositions.length > 0) {
      const sumX = mainChipPinPositions.reduce((s, p) => s + p.x, 0)
      const sumY = mainChipPinPositions.reduce((s, p) => s + p.y, 0)
      mainChipPinCentroid = {
        x: sumX / mainChipPinPositions.length,
        y: sumY / mainChipPinPositions.length,
      }
    }

    // Always a horizontal row: passives vary in x at a shared y, ordered by their
    // connecting main-chip pin, each keeping its fixed (vertical) rotation.
    const sizes = passiveGroup.passiveChipIds.map((id) =>
      getRotatedSize(
        prob.chipMap[id]!.size,
        placements[id]!.ccwRotationDegrees,
      ),
    )
    const rowXOffsets: number[] = []
    let cursor = 0
    for (let i = 0; i < sizes.length; i++) {
      rowXOffsets[i] = cursor + sizes[i]!.x / 2
      cursor += sizes[i]!.x + gap
    }
    const rowWidth = Math.max(0, cursor - gap)
    for (let i = 0; i < rowXOffsets.length; i++) rowXOffsets[i]! -= rowWidth / 2
    const rowHeight = Math.max(...sizes.map((s) => s.y))

    // Resolve the candidate row centres in priority order. For a left/right edge
    // prefer dropping the row just below the lowest connecting pin (its near edge
    // level with that pin) so the traces fan downward in one direction and stay
    // short; only fall back to the pin centroid if the lower placement has no
    // room. A top/bottom edge has a single centre.
    const passiveChipIdSet = new Set(passiveGroup.passiveChipIds)
    const candidateCentres: Array<{ x: number; y: number }> = []
    if (sideIsHorizontal) {
      const outwardDistance =
        (mainChipBox.maxX - mainChipBox.minX) / 2 + gap + rowWidth / 2
      const rowCentreX = mainChipCenter.x + outward.x * outwardDistance
      let lowestPinY = mainChipPinCentroid.y
      if (mainChipPinPositions.length > 0) {
        lowestPinY = Math.min(...mainChipPinPositions.map((p) => p.y))
      }
      // Near (top) edge of the row sits at the lowest connecting pin.
      candidateCentres.push({ x: rowCentreX, y: lowestPinY - rowHeight / 2 })
      candidateCentres.push({ x: rowCentreX, y: mainChipPinCentroid.y })
    } else {
      const outwardDistance =
        (mainChipBox.maxY - mainChipBox.minY) / 2 + gap + rowHeight / 2
      candidateCentres.push({
        x: mainChipPinCentroid.x,
        y: mainChipCenter.y + outward.y * outwardDistance,
      })
    }

    // Try each candidate centre in order. The row slides along its own (x) axis
    // to keep chipGap from every neighbouring (non-group) chip; the first centre
    // that can be fully cleared wins. If none can be cleared, keep the packed
    // positions for this group — those are already overlap-free.
    const maxSlide = mainChipBox.maxX - mainChipBox.minX + rowWidth
    for (const centre of candidateCentres) {
      let slide = 0
      for (let iter = 0; iter < MAX_RESOLVE_ITERATIONS; iter++) {
        // Build the candidate row at the current slide offset.
        const candidate: Record<ChipId, Placement> = {}
        for (let i = 0; i < passiveGroup.passiveChipIds.length; i++) {
          const id = passiveGroup.passiveChipIds[i]!
          candidate[id] = {
            x: centre.x + slide + rowXOffsets[i]!,
            y: centre.y,
            // Keep the packed (fixed) rotation; only reposition.
            ccwRotationDegrees: placements[id]!.ccwRotationDegrees,
          }
        }

        const adjustment = this.clearanceAdjustment(
          candidate,
          placements,
          passiveChipIdSet,
          gap,
        )
        if (adjustment === 0) {
          for (const id of passiveGroup.passiveChipIds) {
            placements[id] = candidate[id]!
          }
          return
        }
        if (adjustment === null) break // crowded both sides; try next centre
        const next = slide + adjustment
        if (Math.abs(next) > maxSlide) break // can't clear here; try next centre
        slide = next
      }
    }
  }

  /**
   * Signed x shift needed to keep the candidate row at least `gap` from every
   * non-group chip (the row only ever moves along x). 0 = already clear; null =
   * crowded from both x directions (cannot be resolved by sliding).
   */
  private clearanceAdjustment(
    candidate: Record<ChipId, Placement>,
    placements: Record<ChipId, Placement>,
    passiveChipIdSet: Set<ChipId>,
    gap: number,
  ): number | null {
    let needPlus = 0
    let needMinus = 0
    for (const [passiveChipId, passivePlacement] of Object.entries(candidate)) {
      const passiveBox = this.boxFor(passiveChipId, passivePlacement)
      for (const [otherChipId, otherPlacement] of Object.entries(placements)) {
        if (passiveChipIdSet.has(otherChipId)) continue
        const otherBox = this.boxFor(otherChipId, otherPlacement)
        if (boundsDistance(passiveBox, otherBox) >= gap - CLEARANCE_EPSILON) {
          continue
        }

        // How much x-gap is needed to reach `gap` clearance at this y overlap.
        const yGap = axisGap(passiveBox, otherBox, "y")
        const xGap = axisGap(passiveBox, otherBox, "x")
        const neededX = Math.sqrt(Math.max(0, gap * gap - yGap * yGap))
        const deficit = neededX - xGap
        if (deficit <= CLEARANCE_EPSILON) continue

        if (getBoundsCenter(passiveBox).x >= getBoundsCenter(otherBox).x) {
          needPlus = Math.max(needPlus, deficit)
        } else {
          needMinus = Math.max(needMinus, deficit)
        }
      }
    }
    if (needPlus > CLEARANCE_EPSILON && needMinus > CLEARANCE_EPSILON)
      return null
    if (needPlus > CLEARANCE_EPSILON) return needPlus
    if (needMinus > CLEARANCE_EPSILON) return -needMinus
    return 0
  }

  /**
   * Axis-aligned bounding box for a chip including any pins that protrude beyond
   * its body (e.g. BT1's pins stick out toward the main chip), so clearance is
   * measured against the pins, not just the body.
   */
  private boxFor(chipId: ChipId, placement: Placement): Bounds {
    const chip = this.partitionInputProblem.chipMap[chipId]!
    const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
    // Body corners plus every (rotated) pin position, so the box also covers
    // pins that protrude past the body edge.
    const points = [
      { x: placement.x - size.x / 2, y: placement.y - size.y / 2 },
      { x: placement.x + size.x / 2, y: placement.y + size.y / 2 },
    ]
    for (const pinId of chip.pins) {
      const pin = this.partitionInputProblem.chipPinMap[pinId]
      if (!pin) continue
      const rotatedOffset = rotatePinOffset(
        pin.offset,
        placement.ccwRotationDegrees,
      )
      points.push({
        x: placement.x + rotatedOffset.x,
        y: placement.y + rotatedOffset.y,
      })
    }
    return getBoundsFromPoints(points)!
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver && !this.solved) {
      return this.activeSubSolver.visualize()
    }
    if (!this.layout) {
      const basicLayout = doBasicInputProblemLayout(this.partitionInputProblem)
      return visualizeInputProblem(this.partitionInputProblem, basicLayout)
    }
    return visualizeInputProblem(this.partitionInputProblem, this.layout)
  }

  override getConstructorParams(): [InputProblem] {
    return [this.partitionInputProblem]
  }
}
