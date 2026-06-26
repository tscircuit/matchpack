/**
 * Specialized solver for packing decoupling capacitors in a linear layout.
 * Decoupling caps are arranged horizontally, sorted by their connection
 * to the main chip's pins for optimal routing proximity.
 *
 * Layout strategy:
 * 1. Identify the main chip (largest non-cap chip) in the partition
 * 2. Sort decoupling caps by their connected pin positions on the main chip
 * 3. Arrange caps in a horizontal line with consistent spacing
 * 4. Align caps so that pins connected to the same nets face the same direction
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  PartitionInputProblem,
  ChipId,
  PinId,
  NetId,
  ChipPin,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

export class DecouplingCapsPackingSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null

  constructor(params: { partitionInputProblem: PartitionInputProblem }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
  }

  override _step() {
    this.layout = this.computeDecouplingCapsLayout()
    this.solved = true
  }

  /**
   * Compute a linear layout for decoupling capacitors.
   * Caps are sorted by the y-position of their connected pins on the main chip,
   * then placed horizontally with consistent gap.
   */
  private computeDecouplingCapsLayout(): OutputLayout {
    const { chipMap, chipPinMap, netMap } = this.partitionInputProblem

    const chipIds = Object.keys(chipMap)

    // Identify the main chip (the one with most pins, typically the IC)
    let mainChipId: ChipId | null = null
    let maxPins = 0
    const capChipIds: ChipId[] = []

    for (const chipId of chipIds) {
      const chip = chipMap[chipId]
      // Decoupling caps typically have exactly 2 pins
      if (chip.pins.length <= 2) {
        capChipIds.push(chipId)
      } else {
        if (chip.pins.length > maxPins) {
          maxPins = chip.pins.length
          mainChipId = chipId
        }
      }
    }

    // If no main chip found, fall back to first non-cap chip or just pack linearly
    if (!mainChipId && chipIds.length > 0) {
      mainChipId = chipIds.find((id) => !capChipIds.includes(id)) || chipIds[0]
    }

    const gap = this.partitionInputProblem.decouplingCapsGap
      ?? this.partitionInputProblem.chipGap

    // Build a map from netId to pin positions on the main chip
    const mainChipPinPositions: Record<PinId, { x: number; y: number }> = {}
    if (mainChipId) {
      const mainChip = chipMap[mainChipId]
      for (const pinId of mainChip.pins) {
        const pin = chipPinMap[pinId]
        if (pin) {
          mainChipPinPositions[pinId] = { x: pin.offset.x, y: pin.offset.y }
        }
      }
    }

    // For each cap, find the main chip pin it's connected to via a shared net
    const capSortKeys: Array<{ chipId: ChipId; sortKey: number }> = []
    for (const capId of capChipIds) {
      const cap = chipMap[capId]
      let bestSortKey = Infinity

      for (const pinId of cap.pins) {
        const pin = chipPinMap[pinId]
        if (!pin) continue

        // Find nets this pin belongs to
        for (const [netId, netPins] of Object.entries(netMap)) {
          if (!netPins.includes(pinId)) continue

          // Check if main chip has a pin on this net
          if (mainChipId) {
            const mainChip = chipMap[mainChipId]
            for (const mainPinId of mainChip.pins) {
              if (netPins.includes(mainPinId) && mainChipPinPositions[mainPinId]) {
                const pos = mainChipPinPositions[mainPinId]
                // Use y-position of the connected main chip pin as sort key
                bestSortKey = Math.min(bestSortKey, pos.y)
              }
            }
          }
        }
      }

      capSortKeys.push({ chipId: capId, sortKey: bestSortKey })
    }

    // Sort caps by their connection proximity on main chip
    capSortKeys.sort((a, b) => a.sortKey - b.sortKey)
    const sortedCapIds = capSortKeys.map((entry) => entry.chipId)

    // Place main chip at center, caps in horizontal line below
    const chipPlacements: Record<string, Placement> = {}

    // Determine the orientation for each cap based on pin sides
    // For decoupling caps with 2 pins, try to align them consistently
    const getCapRotation = (capId: ChipId): number => {
      const cap = chipMap[capId]
      if (cap.availableRotations) {
        // Prefer 0 rotation, then 180, then others
        if (cap.availableRotations.includes(0)) return 0
        if (cap.availableRotations.includes(180)) return 180
        return cap.availableRotations[0]
      }
      return 0
    }

    if (mainChipId) {
      const mainChip = chipMap[mainChipId]
      chipPlacements[mainChipId] = {
        x: 0,
        y: 0,
        ccwRotationDegrees: 0,
      }

      // Place caps in a horizontal line below the main chip
      const mainChipHeight = mainChip.size.y
      let currentX = 0

      for (const capId of sortedCapIds) {
        const cap = chipMap[capId]
        const rotation = getCapRotation(capId)
        const capWidth = rotation % 180 === 0 ? cap.size.x : cap.size.y
        const capHeight = rotation % 180 === 0 ? cap.size.y : cap.size.x

        chipPlacements[capId] = {
          x: currentX + capWidth / 2,
          y: -(mainChipHeight / 2 + gap + capHeight / 2),
          ccwRotationDegrees: rotation,
        }

        currentX += capWidth + gap
      }

      // Center the cap row relative to main chip
      if (sortedCapIds.length > 0) {
        const lastCapId = sortedCapIds[sortedCapIds.length - 1]
        const lastCap = chipMap[lastCapId]
        const lastRotation = getCapRotation(lastCapId)
        const lastCapWidth = lastRotation % 180 === 0 ? lastCap.size.x : lastCap.size.y
        const totalWidth = chipPlacements[lastCapId].x + lastCapWidth / 2

        // Shift all caps left by half total width to center
        const shiftX = -totalWidth / 2
        for (const capId of sortedCapIds) {
          chipPlacements[capId].x += shiftX
        }
      }
    } else {
      // No main chip, just place all chips in a line
      let currentX = 0
      for (const chipId of sortedCapIds.length > 0 ? sortedCapIds : chipIds) {
        const chip = chipMap[chipId]
        const rotation = getCapRotation(chipId)
        const chipWidth = rotation % 180 === 0 ? chip.size.x : chip.size.y

        chipPlacements[chipId] = {
          x: currentX + chipWidth / 2,
          y: 0,
          ccwRotationDegrees: rotation,
        }

        currentX += chipWidth + gap
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (!this.layout) {
      const basicLayout = doBasicInputProblemLayout(this.partitionInputProblem)
      return visualizeInputProblem(this.partitionInputProblem, basicLayout)
    }

    return visualizeInputProblem(this.partitionInputProblem, this.layout)
  }

  override getConstructorParams(): [PartitionInputProblem] {
    return [this.partitionInputProblem]
  }
}