/**
 * Sub-solver for processing pin ranges within a single partition
 */

import type { GraphicsObject } from "graphics-debug"
import type { Point } from "@tscircuit/math-utils"
import { BaseSolver } from "../../BaseSolver"
import type {
  ChipId,
  GroupId,
  InputProblem,
  PinId,
} from "../../../types/InputProblem"
import type { Side } from "../../../types/Side"

const MAX_PIN_RANGE_GAP = 0.2
const MAX_PIN_RANGE_SIZE = 3

export type PinRange = {
  pinIds: PinId[]
  side: Side
  chipId?: ChipId
  groupId?: GroupId
}

export class PartitionPinRangeMatchSolver extends BaseSolver {
  inputProblem: InputProblem
  pinRanges: PinRange[] = []

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
  }

  override _step() {
    this.pinRanges = this.createPinRanges()
    this.solved = true
  }

  private createPinRanges(): PinRange[] {
    const pinRanges: PinRange[] = []

    // Process each chip
    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      const chipPinRanges = this.createPinRangesForChip(chipId, chip.pins)
      pinRanges.push(...chipPinRanges)
    }

    // Process each group
    for (const [groupId, group] of Object.entries(this.inputProblem.groupMap)) {
      const groupPinRanges = this.createPinRangesForGroup(groupId, group.pins)
      pinRanges.push(...groupPinRanges)
    }

    return pinRanges
  }

  private createPinRangesForChip(chipId: ChipId, pinIds: PinId[]): PinRange[] {
    // Group pins by side
    const pinsBySide = new Map<Side, Array<{ pinId: PinId; offset: Point }>>()

    for (const pinId of pinIds) {
      const chipPin = this.inputProblem.chipPinMap[pinId]
      if (!chipPin) continue

      if (!pinsBySide.has(chipPin.side)) {
        pinsBySide.set(chipPin.side, [])
      }
      pinsBySide.get(chipPin.side)!.push({ pinId, offset: chipPin.offset })
    }

    const pinRanges: PinRange[] = []

    // Create pin ranges for each side
    for (const [side, pins] of pinsBySide.entries()) {
      const ranges = this.createPinRangesForSide(side, pins, chipId)
      pinRanges.push(...ranges)
    }

    return pinRanges
  }

  private createPinRangesForGroup(
    groupId: GroupId,
    pinIds: PinId[],
  ): PinRange[] {
    // For groups, we don't have side information in the same way,
    // so we'll group by proximity and assume they're on the same "side"
    const pinsWithOffsets = pinIds
      .map((pinId) => {
        const groupPin = this.inputProblem.groupPinMap[pinId]
        return groupPin ? { pinId, offset: groupPin.offset } : null
      })
      .filter((pin) => pin !== null && pin.offset !== undefined) as Array<{
      pinId: PinId
      offset: Point
    }>

    if (pinsWithOffsets.length === 0) return []

    // For simplicity, treat all group pins as being on the same side (x+)
    // In a more sophisticated implementation, we could analyze positions
    const side: Side = "x+"
    return this.createPinRangesForSide(
      side,
      pinsWithOffsets,
      undefined,
      groupId,
    )
  }

  private createPinRangesForSide(
    side: Side,
    pins: Array<{ pinId: PinId; offset: Point }>,
    chipId?: ChipId,
    groupId?: GroupId,
  ): PinRange[] {
    if (pins.length === 0) return []

    // Sort pins by position along the side
    const sortedPins = this.sortPinsBySide(pins, side)

    const pinRanges: PinRange[] = []
    let currentRange: PinId[] = []

    for (let i = 0; i < sortedPins.length; i++) {
      const pin = sortedPins[i]!

      // Check if we can add this pin to the current range
      if (currentRange.length === 0) {
        // Start a new range
        currentRange = [pin.pinId]
      } else if (currentRange.length < MAX_PIN_RANGE_SIZE) {
        // Check distance to previous pin
        const prevPin = sortedPins[i - 1]!
        const distance = this.calculateDistance(prevPin.offset, pin.offset)

        if (distance <= MAX_PIN_RANGE_GAP) {
          // Add to current range
          currentRange.push(pin.pinId)
        } else {
          // Start a new range
          pinRanges.push({
            pinIds: [...currentRange],
            side,
            chipId,
            groupId,
          })
          currentRange = [pin.pinId]
        }
      } else {
        // Current range is full, start a new one
        pinRanges.push({
          pinIds: [...currentRange],
          side,
          chipId,
          groupId,
        })
        currentRange = [pin.pinId]
      }
    }

    // Add the final range if it exists
    if (currentRange.length > 0) {
      pinRanges.push({
        pinIds: [...currentRange],
        side,
        chipId,
        groupId,
      })
    }

    return pinRanges
  }

  private sortPinsBySide(
    pins: Array<{ pinId: PinId; offset: Point }>,
    side: Side,
  ) {
    return pins.sort((a, b) => {
      // Sort by the coordinate perpendicular to the side
      switch (side) {
        case "x-":
        case "x+":
          return a.offset.y - b.offset.y
        case "y-":
        case "y+":
          return a.offset.x - b.offset.x
        default:
          return 0
      }
    })
  }

  private calculateDistance(p1: Point, p2: Point): number {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
  }

  override visualize(): GraphicsObject {
    // For now, return a simple visualization
    return {
      lines: [],
      points: this.pinRanges.flatMap((range) =>
        range.pinIds
          .map((pinId) => {
            const chipPin = this.inputProblem.chipPinMap[pinId]
            const groupPin = this.inputProblem.groupPinMap[pinId]
            const offset = chipPin?.offset || groupPin?.offset
            return offset ? { x: offset.x, y: offset.y, color: "blue" } : null
          })
          .filter(
            (point): point is { x: number; y: number; color: string } =>
              point !== null,
          ),
      ),
      rects: [],
      circles: [],
    }
  }

  override getConstructorParams() {
    return { inputProblem: this.inputProblem }
  }
}
