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
  connectedPins?: PinId[]
  connectedChips?: ChipId[]
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

    // Identify potential passive components (two-pin chips that are connected to other chips)
    const passiveChips = new Set<ChipId>()
    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      if (chip.pins.length === 2) {
        // Check if this 2-pin chip is connected to chips with more pins (acting as a passive)
        let connectedToLargerChip = false
        for (const pinId of chip.pins) {
          for (const [connKey, connected] of Object.entries(this.inputProblem.pinStrongConnMap)) {
            if (!connected) continue
            
            const [pin1Id, pin2Id] = connKey.split("-") as [PinId, PinId]
            let connectedPinId: PinId | null = null
            
            if (pin1Id === pinId) {
              connectedPinId = pin2Id
            } else if (pin2Id === pinId) {
              connectedPinId = pin1Id
            }
            
            if (connectedPinId) {
              // Find which chip the connected pin belongs to
              for (const [, otherChip] of Object.entries(this.inputProblem.chipMap)) {
                if (otherChip.pins.includes(connectedPinId) && otherChip.pins.length > 2) {
                  connectedToLargerChip = true
                  break
                }
              }
            }
            if (connectedToLargerChip) break
          }
          if (connectedToLargerChip) break
        }
        
        if (connectedToLargerChip) {
          passiveChips.add(chipId)
        }
      }
    }

    // Process each non-passive chip
    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      if (!passiveChips.has(chipId)) {
        const chipPinRanges = this.createPinRangesForChip(chipId, chip.pins)
        pinRanges.push(...chipPinRanges)
      }
    }

    // Process each group
    for (const [groupId, group] of Object.entries(this.inputProblem.groupMap)) {
      const groupPinRanges = this.createPinRangesForGroup(groupId, group.pins)
      pinRanges.push(...groupPinRanges)
    }

    // Find connected passives for each pin range
    for (const range of pinRanges) {
      const connectedInfo = this.findConnectedPassives(range.pinIds, passiveChips)
      range.connectedPins = connectedInfo.connectedPins
      range.connectedChips = connectedInfo.connectedChips
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

  private findConnectedPassives(rangePinIds: PinId[], passiveChips: Set<ChipId>): {
    connectedPins: PinId[]
    connectedChips: ChipId[]
  } {
    const connectedPins: PinId[] = []
    const connectedChips: ChipId[] = []

    // For each pin in the range, find connected passive components
    for (const rangePinId of rangePinIds) {
      // Check strong connections to this pin
      for (const [connKey, connected] of Object.entries(this.inputProblem.pinStrongConnMap)) {
        if (!connected) continue
        
        const [pin1Id, pin2Id] = connKey.split("-") as [PinId, PinId]
        let connectedPinId: PinId | null = null
        
        if (pin1Id === rangePinId) {
          connectedPinId = pin2Id
        } else if (pin2Id === rangePinId) {
          connectedPinId = pin1Id
        }
        
        if (connectedPinId) {
          // Find which chip this connected pin belongs to
          for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
            if (chip.pins.includes(connectedPinId) && passiveChips.has(chipId)) {
              // This is a connected passive component
              if (!connectedChips.includes(chipId)) {
                connectedChips.push(chipId)
                // Add both pins of the passive component
                connectedPins.push(...chip.pins.filter(pinId => !connectedPins.includes(pinId)))
              }
              break
            }
          }
        }
      }
    }

    return { connectedPins, connectedChips }
  }

  override visualize(): GraphicsObject {
    return {
      lines: [],
      points: this.pinRanges.flatMap((range) => {
        // Main pin range points in blue
        const rangePinPoints = range.pinIds
          .map((pinId) => {
            const chipPin = this.inputProblem.chipPinMap[pinId]
            const groupPin = this.inputProblem.groupPinMap[pinId]
            const offset = chipPin?.offset || groupPin?.offset
            return offset ? { x: offset.x, y: offset.y, color: "blue" } : null
          })
          .filter(
            (point): point is { x: number; y: number; color: string } =>
              point !== null,
          )
        
        // Connected passive pins in orange
        const connectedPinPoints = (range.connectedPins || [])
          .map((pinId) => {
            const chipPin = this.inputProblem.chipPinMap[pinId]
            const groupPin = this.inputProblem.groupPinMap[pinId]
            const offset = chipPin?.offset || groupPin?.offset
            return offset ? { x: offset.x, y: offset.y, color: "orange" } : null
          })
          .filter(
            (point): point is { x: number; y: number; color: string } =>
              point !== null,
          )
        
        return [...rangePinPoints, ...connectedPinPoints]
      }),
      rects: [],
      circles: [],
    }
  }

  override getConstructorParams() {
    return { inputProblem: this.inputProblem }
  }
}
