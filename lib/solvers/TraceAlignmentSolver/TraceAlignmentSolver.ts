/**
 * Post-pack solver that aligns strongly-connected pin pairs to reduce
 * trace zig-zag in the schematic. After partition packing snaps chips
 * to a grid, pins on adjacent chips often have small off-axis deltas
 * that create visible zig-zag traces. This solver nudges chips to
 * minimize those deltas without creating new overlaps.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"

export interface TraceAlignmentSolverInput {
  inputProblem: InputProblem
  layout: OutputLayout
  maxNudge: number // maximum single-axis nudge distance
  minImprovement: number // minimum zig-zag reduction to accept a nudge
  passes: number // number of alignment passes
}

export class TraceAlignmentSolver extends BaseSolver {
  inputProblem: InputProblem
  layout: OutputLayout
  maxNudge: number
  minImprovement: number
  passes: number

  // Track alignment metrics
  totalZigZagBefore = 0
  totalZigZagAfter = 0
  nudgesApplied: Array<{
    chipId: string
    deltaX: number
    deltaY: number
    improvement: number
  }> = []

  // Computed strong connection pairs
  strongConnectionPairs: Array<{
    pin1: PinId
    pin2: PinId
    chip1Id: string
    chip2Id: string
  }> = []

  // Chip world pin positions cache
  chipWorldPinPositions: Map<
    PinId,
    { x: number; y: number; side: string }
  > = new Map()

  constructor(input: TraceAlignmentSolverInput) {
    super()
    this.inputProblem = input.inputProblem
    this.layout = input.layout
    this.maxNudge = input.maxNudge ?? 0.6
    this.minImprovement = input.minImprovement ?? 0.05
    this.passes = input.passes ?? 3
    this.MAX_ITERATIONS = 1

    // Build strong connection pairs
    this.buildStrongConnectionPairs()
  }

  private buildStrongConnectionPairs() {
    const { pinStrongConnMap, chipPinMap } = this.inputProblem

    for (const [connKey, connected] of Object.entries(pinStrongConnMap)) {
      if (!connected) continue

      // Parse "pin1-pin2" format (skip "pin1-netId" which are net connections)
      const dashIndex = connKey.indexOf("-")
      if (dashIndex === -1) continue

      const pin1 = connKey.slice(0, dashIndex)
      const rest = connKey.slice(dashIndex + 1)

      // Check if rest is a pin ID (contains ".") or a net ID
      if (!rest.includes(".")) continue // It's a net ID, skip

      const pin2 = rest
      const chip1Id = pin1.split(".")[0]
      const chip2Id = pin2.split(".")[0]

      // Only inter-chip connections
      if (chip1Id === chip2Id) continue
      // Only if both chips exist in layout
      if (
        !this.layout.chipPlacements[chip1Id!] ||
        !this.layout.chipPlacements[chip2Id!]
      )
        continue
      // Only if both pins exist
      if (!chipPinMap[pin1] || !chipPinMap[pin2]) continue

      this.strongConnectionPairs.push({
        pin1: pin1 as PinId,
        pin2: pin2 as PinId,
        chip1Id: chip1Id!,
        chip2Id: chip2Id!,
      })
    }
  }

  private computeWorldPinPos(pinId: PinId): {
    x: number
    y: number
    side: string
  } | null {
    if (this.chipWorldPinPositions.has(pinId)) {
      return this.chipWorldPinPositions.get(pinId)!
    }

    const pin = this.inputProblem.chipPinMap[pinId]
    if (!pin) return null

    const chipId = pinId.split(".")[0]
    const placement = this.layout.chipPlacements[chipId!]
    if (!placement) return null

    const chip = this.inputProblem.chipMap[chipId!]
    if (!chip) return null

    const hw = chip.size.x / 2
    const hh = chip.size.y / 2

    let ox = pin.offset.x * hw
    let oy = pin.offset.y * hh

    const rot = ((placement.ccwRotationDegrees || 0) * Math.PI) / 180
    const cosR = Math.cos(rot)
    const sinR = Math.sin(rot)

    const rx = ox * cosR - oy * sinR
    const ry = ox * sinR + oy * cosR

    const worldPos = {
      x: placement.x + rx,
      y: placement.y + ry,
      side: pin.side,
    }

    this.chipWorldPinPositions.set(pinId, worldPos)
    return worldPos
  }

  private invalidateChipPinPositions(chipId: string) {
    for (const pinId of this.chipWorldPinPositions.keys()) {
      if (pinId.startsWith(chipId + ".")) {
        this.chipWorldPinPositions.delete(pinId)
      }
    }
  }

  private computeZigZagForChip(chipId: string): number {
    let totalZigZag = 0
    let connectionCount = 0

    for (const pair of this.strongConnectionPairs) {
      if (pair.chip1Id !== chipId && pair.chip2Id !== chipId) continue

      const p1 = this.computeWorldPinPos(pair.pin1)
      const p2 = this.computeWorldPinPos(pair.pin2)
      if (!p1 || !p2) continue

      // Zig-zag is the off-axis delta for connected pins
      // If both pins face left/right (horizontal sides), zig-zag is the Y delta
      // If both pins face top/bottom (vertical sides), zig-zag is the X delta
      // For mixed sides, use Euclidean distance as zig-zag metric
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y

      const isHorizontal =
        (p1.side === "x+" || p1.side === "x-") &&
        (p2.side === "x+" || p2.side === "x-")
      const isVertical =
        (p1.side === "y+" || p1.side === "y-") &&
        (p2.side === "y+" || p2.side === "y-")

      let zigzag: number
      if (isHorizontal) {
        zigzag = Math.abs(dy)
      } else if (isVertical) {
        zigzag = Math.abs(dx)
      } else {
        // Mixed sides: consider off-axis component
        // If one is horizontal and one is vertical, we want to minimize
        // the perpendicular component
        const primaryAxis = Math.max(Math.abs(dx), Math.abs(dy))
        const perpAxis = Math.min(Math.abs(dx), Math.abs(dy))
        zigzag = perpAxis
      }

      totalZigZag += zigzag
      connectionCount++
    }

    return connectionCount > 0 ? totalZigZag / connectionCount : 0
  }

  private computeTotalZigZag(): number {
    let total = 0
    const chipIds = new Set<string>()
    for (const pair of this.strongConnectionPairs) {
      chipIds.add(pair.chip1Id)
      chipIds.add(pair.chip2Id)
    }
    for (const chipId of chipIds) {
      total += this.computeZigZagForChip(chipId)
    }
    return chipIds.size > 0 ? total / chipIds.size : 0
  }

  private checkOverlap(
    chipId: string,
    newX: number,
    newY: number,
  ): boolean {
    const chip1 = this.inputProblem.chipMap[chipId]
    if (!chip1) return false

    const placement1 = this.layout.chipPlacements[chipId]
    const rot1 = ((placement1?.ccwRotationDegrees || 0) * Math.PI) / 180
    const cos1 = Math.abs(Math.cos(rot1))
    const sin1 = Math.abs(Math.sin(rot1))
    const hw1 = chip1.size.x / 2
    const hh1 = chip1.size.y / 2
    const rw1 = hw1 * cos1 + hh1 * sin1
    const rh1 = hw1 * sin1 + hh1 * cos1

    for (const otherId of Object.keys(this.layout.chipPlacements)) {
      if (otherId === chipId) continue

      const chip2 = this.inputProblem.chipMap[otherId]
      if (!chip2) continue

      const placement2 = this.layout.chipPlacements[otherId]
      const rot2 = ((placement2?.ccwRotationDegrees || 0) * Math.PI) / 180
      const cos2 = Math.abs(Math.cos(rot2))
      const sin2 = Math.abs(Math.sin(rot2))
      const hw2 = chip2.size.x / 2
      const hh2 = chip2.size.y / 2
      const rw2 = hw2 * cos2 + hh2 * sin2
      const rh2 = hw2 * sin2 + hh2 * cos2

      // Add a small margin to avoid edge touching
      const margin = 0.05
      if (
        newX + rw1 + margin > placement2.x - rw2 &&
        newX - rw1 - margin < placement2.x + rw2 &&
        newY + rh1 + margin > placement2.y - rh2 &&
        newY - rh1 - margin < placement2.y + rh2
      ) {
        return true // Overlap detected
      }
    }
    return false
  }

  override _step() {
    this.totalZigZagBefore = this.computeTotalZigZag()

    // Collect all chips involved in strong connections
    const chipIds = new Set<string>()
    for (const pair of this.strongConnectionPairs) {
      chipIds.add(pair.chip1Id)
      chipIds.add(pair.chip2Id)
    }

    // Multiple passes to allow cascading improvements
    for (let pass = 0; pass < this.passes; pass++) {
      for (const chipId of chipIds) {
        this.tryAlignChip(chipId)
      }
    }

    this.totalZigZagAfter = this.computeTotalZigZag()
    this.solved = true
  }

  private tryAlignChip(chipId: string) {
    const currentPlacement = this.layout.chipPlacements[chipId]
    if (!currentPlacement) return

    const currentZigZag = this.computeZigZagForChip(chipId)
    if (currentZigZag < 0.01) return // Already well-aligned

    // Collect all strong connections for this chip
    const connections: Array<{
      otherPinId: PinId
      otherChipId: string
      myPinId: PinId
    }> = []

    for (const pair of this.strongConnectionPairs) {
      if (pair.chip1Id === chipId) {
        connections.push({
          myPinId: pair.pin1,
          otherPinId: pair.pin2,
          otherChipId: pair.chip2Id,
        })
      } else if (pair.chip2Id === chipId) {
        connections.push({
          myPinId: pair.pin2,
          otherPinId: pair.pin1,
          otherChipId: pair.chip1Id,
        })
      }
    }

    if (connections.length === 0) return

    // Compute desired nudge for each connection
    let totalDesiredDeltaX = 0
    let totalDesiredDeltaY = 0

    for (const conn of connections) {
      const myPin = this.computeWorldPinPos(conn.myPinId)
      const otherPin = this.computeWorldPinPos(conn.otherPinId)
      if (!myPin || !otherPin) continue

      const chip = this.inputProblem.chipMap[chipId]
      if (!chip) continue

      const placement = this.layout.chipPlacements[chipId]!
      const myPinData = this.inputProblem.chipPinMap[conn.myPinId]
      if (!myPinData) continue

      // Compute the ideal nudge to align this pin with its partner
      const rot = ((placement.ccwRotationDegrees || 0) * Math.PI) / 180

      // Pin offset in chip-local coordinates
      const hw = chip.size.x / 2
      const hh = chip.size.y / 2
      let localX = myPinData.offset.x * hw
      let localY = myPinData.offset.y * hh

      // After rotation, how does a chip-center delta affect this pin?
      const cosR = Math.cos(rot)
      const sinR = Math.sin(rot)

      // dPinX/dChipCenterX = cosR, dPinX/dChipCenterY = -sinR
      // dPinY/dChipCenterX = sinR, dPinY/dChipCenterY = cosR
      // Inverse: to change pin world position by (dx, dy), we need to move chip center by:
      // chipDx = cosR * dx + sinR * dy (not right, need inverse of the rotation)

      // Actually for rotation R, pin_offset_world = R * pin_offset_local
      // If chip center moves by (dx, dy), pin world pos moves by (dx, dy)
      // So to align myPin with otherPin:
      // currentPinPos + nudge = otherPinPos
      // nudge = otherPinPos - currentPinPos

      const desiredDx = otherPin.x - myPin.x
      const desiredDy = otherPin.y - myPin.y

      totalDesiredDeltaX += desiredDx
      totalDesiredDeltaY += desiredDy
    }

    // Average desired nudge
    const avgDx = totalDesiredDeltaX / connections.length
    const avgDy = totalDesiredDeltaY / connections.length

    // Clamp to max nudge
    const clampedDx = Math.max(-this.maxNudge, Math.min(this.maxNudge, avgDx))
    const clampedDy = Math.max(-this.maxNudge, Math.min(this.maxNudge, avgDy))

    // Skip tiny nudges
    if (Math.abs(clampedDx) < 0.01 && Math.abs(clampedDy) < 0.01) return

    // Try the nudge
    const newX = currentPlacement.x + clampedDx
    const newY = currentPlacement.y + clampedDy

    // Check for overlaps
    if (this.checkOverlap(chipId, newX, newY)) {
      // Try X-only nudge
      if (Math.abs(clampedDx) > 0.01) {
        const xOnlyX = currentPlacement.x + clampedDx
        if (!this.checkOverlap(chipId, xOnlyX, currentPlacement.y)) {
          this.layout.chipPlacements[chipId]!.x = xOnlyX
          this.invalidateChipPinPositions(chipId)
          this.nudgesApplied.push({
            chipId,
            deltaX: clampedDx,
            deltaY: 0,
            improvement:
              currentZigZag - this.computeZigZagForChip(chipId),
          })
        }
      }
      // Try Y-only nudge
      if (Math.abs(clampedDy) > 0.01) {
        const yOnlyY = currentPlacement.y + clampedDy
        if (!this.checkOverlap(chipId, currentPlacement.x, yOnlyY)) {
          this.layout.chipPlacements[chipId]!.y = yOnlyY
          this.invalidateChipPinPositions(chipId)
          this.nudgesApplied.push({
            chipId,
            deltaX: 0,
            deltaY: clampedDy,
            improvement:
              currentZigZag - this.computeZigZagForChip(chipId),
          })
        }
      }
      return
    }

    // Apply nudge
    this.layout.chipPlacements[chipId]!.x = newX
    this.layout.chipPlacements[chipId]!.y = newY

    const newZigZag = this.computeZigZagForChip(chipId)
    const improvement = currentZigZag - newZigZag

    // Reject if improvement is too small or negative
    if (improvement < this.minImprovement) {
      // Revert
      this.layout.chipPlacements[chipId]!.x = currentPlacement.x
      this.layout.chipPlacements[chipId]!.y = currentPlacement.y
      this.invalidateChipPinPositions(chipId)
      return
    }

    this.invalidateChipPinPositions(chipId)
    this.nudgesApplied.push({
      chipId,
      deltaX: clampedDx,
      deltaY: clampedDy,
      improvement,
    })
  }

  override visualize(): GraphicsObject {
    // Delegate to the input problem visualization with the aligned layout
    const { visualizeInputProblem } = require("../LayoutPipelineSolver/visualizeInputProblem")
    return visualizeInputProblem(this.inputProblem, this.layout)
  }
}
