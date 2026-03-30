/**
 * Solves the layout for a "Star Topology" partition.
 * A star topology consists of a single "main" chip (usually an IC) and multiple
 * 2-pin components (capacitors, resistors) that connect directly to the main chip's pins.
 * This solver aligns the 2-pin components orthogonally with the pins they connect to,
 * stacking them neatly and ensuring they don't overlap, instead of using a generic packer.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  InputProblem,
  PinId,
  ChipPin,
  PartitionInputProblem,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export class StarTopologyPackingSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  layout: OutputLayout | null = null

  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.pinIdToStronglyConnectedPins = params.pinIdToStronglyConnectedPins
  }

  override _step() {
    try {
      this.layout = this.solveStarTopology()
      this.solved = true
    } catch (e: any) {
      this.failed = true
      this.error = e.message
    }
  }

  /**
   * Identifies the main chip and packs satellite chips around it.
   */
  private solveStarTopology(): OutputLayout {
    const chipIds = Object.keys(this.partitionInputProblem.chipMap)

    // A star topology needs at least a main chip and one satellite.
    if (chipIds.length < 2) {
      throw new Error("Not enough chips for a star topology")
    }

    // Identify the main chip: the one that has the most connections, or just the one with > 2 pins.
    let mainChipId: string | null = null
    const satellites: string[] = []

    for (const chipId of chipIds) {
      const chip = this.partitionInputProblem.chipMap[chipId]!
      if (chip.pins.length > 2) {
        if (mainChipId) {
          throw new Error(
            "Multiple >2 pin chips found, not a simple star topology",
          )
        }
        mainChipId = chipId
      } else {
        satellites.push(chipId)
      }
    }

    // Fallback: if all chips are 2 pins, just pick the central one based on connections.
    if (!mainChipId) {
      // Since the task says "bad layout with voltage regulator", we usually have an IC.
      // But if they are all 2-pin, we'll just abort and fall back to SingleInnerPartitionPackingSolver.
      throw new Error("No main IC found in partition for star topology")
    }

    const mainChip = this.partitionInputProblem.chipMap[mainChipId]!
    const chipPlacements: Record<string, Placement> = {}

    // Place the main chip at (0, 0)
    chipPlacements[mainChipId] = {
      x: 0,
      y: 0,
      ccwRotationDegrees: 0, // We could optimize rotation based on connections, but assume 0 for now
    }

    // Now place each satellite chip.
    // For each satellite, find which pin on the main chip it connects to.
    // Group satellites by the side of the main chip they connect to (e.g. "x-", "x+").

    interface SatellitePlacementReq {
      chipId: string
      targetPin: ChipPin
      side: string
    }

    const sideGroups: Record<string, SatellitePlacementReq[]> = {
      "x-": [],
      "x+": [],
      "y-": [],
      "y+": [],
    }

    for (const satId of satellites) {
      const satChip = this.partitionInputProblem.chipMap[satId]!
      // Find connection to main chip
      let connectedMainPinId: string | null = null

      // Check strong connections
      for (const satPinId of satChip.pins) {
        const connectedPins = this.pinIdToStronglyConnectedPins[satPinId] || []
        for (const connectedPin of connectedPins) {
          if (mainChip.pins.includes(connectedPin.pinId)) {
            connectedMainPinId = connectedPin.pinId
            break
          }
        }
        if (connectedMainPinId) break
      }

      if (!connectedMainPinId) {
        // Sub-optimal: if it doesn't directly connect to main chip, this isn't a pure star topology.
        throw new Error(
          `Satellite ${satId} is not connected directly to main chip ${mainChipId}`,
        )
      }

      const mainPin = this.partitionInputProblem.chipPinMap[connectedMainPinId]!
      sideGroups[mainPin.side]?.push({
        chipId: satId,
        targetPin: mainPin,
        side: mainPin.side,
      })
    }

    // For each side, stack the components so they don't overlap.
    const gap =
      this.partitionInputProblem.partitionType === "decoupling_caps"
        ? (this.partitionInputProblem.decouplingCapsGap ??
          this.partitionInputProblem.chipGap)
        : this.partitionInputProblem.chipGap

    for (const side of Object.keys(sideGroups)) {
      const sats = sideGroups[side]!
      if (sats.length === 0) continue

      // Sort satellites by target pin coordinate so traces don't cross.
      // E.g. for "x-" side, sort by y offset.
      if (side === "x-" || side === "x+") {
        sats.sort((a, b) => b.targetPin.offset.y - a.targetPin.offset.y) // top to bottom

        let currentYOffset = 0
        // Group by pin to align caps connected to the same pin together?
        // Let's just stack them sequentially next to their target pins.
        // Wait, if 3 caps connect to the exact same pin, they must be stacked perfectly.
        // If they connect to different pins, they should align with their respective pins if possible,
        // but shift to avoid overlapping each other.

        // Actually, just find the best non-overlapping Y positions:
        // Ideal Y for each cap is its targetPin.offset.y
        // But if they overlap, we must push them apart.
        // Simple 1D packing:
        let currentY = Infinity // start from top (positive y is up/down? Usually y is down visually? Let's just track)
        // Wait, tscircuit uses coordinate systems where center is 0,0.
        // Let's sweep and push.
        for (const req of sats) {
          const satChip = this.partitionInputProblem.chipMap[req.chipId]!
          const targetY = req.targetPin.offset.y

          // Place cap
          // Rotation: If it's on x- or x+, cap should probably be rotated 0 or 180 (so its pins face x axis).
          // But wait, what if the cap pins are default on y- and y+?
          // If we rotate it 90 degrees, its pins go to x- and x+.
          // Let's just keep ccwRotationDegrees = 0 for now and let the routing figure it out.
          // Or check available rotations.
          let rotationDegrees = 0
          if (satChip.availableRotations?.includes(90)) {
            // we'd prefer 90 if it means pins face the main chip
            // but we don't have to be extremely smart right now,
            // just place it neatly.
          }

          // Let's calculate its vertical extents (assuming rotation 0)
          const satHeight = satChip.size.y
          const satWidth = satChip.size.x

          // Initial position is aligned with the pin
          let placeY = targetY

          // Check if it overlaps with the previously placed capacitor
          if (currentY !== Infinity) {
            const prevBottom = currentY - gap // we're going top to bottom, so currentY is the top coordinate of the NEXT space
            const neededTop = placeY + satHeight / 2
            if (neededTop > prevBottom) {
              // Must push down
              placeY = prevBottom - satHeight / 2
            }
          }

          // X placement: just outside the main chip
          let placeX = 0
          if (side === "x-") {
            placeX = -(mainChip.size.x / 2 + gap + satWidth / 2)
          } else {
            placeX = mainChip.size.x / 2 + gap + satWidth / 2
          }

          chipPlacements[req.chipId] = {
            x: placeX,
            y: placeY,
            ccwRotationDegrees: rotationDegrees,
          }

          currentY = placeY - satHeight / 2
        }
      } else {
        // "y-" or "y+" side
        sats.sort((a, b) => a.targetPin.offset.x - b.targetPin.offset.x) // left to right
        let currentX = -Infinity
        for (const req of sats) {
          const satChip = this.partitionInputProblem.chipMap[req.chipId]!
          const targetX = req.targetPin.offset.x

          const satHeight = satChip.size.y
          const satWidth = satChip.size.x

          let placeX = targetX

          if (currentX !== -Infinity) {
            const prevRight = currentX + gap
            const neededLeft = placeX - satWidth / 2
            if (neededLeft < prevRight) {
              placeX = prevRight + satWidth / 2
            }
          }

          let placeY = 0
          if (side === "y-") {
            placeY = -(mainChip.size.y / 2 + gap + satHeight / 2)
          } else {
            placeY = mainChip.size.y / 2 + gap + satHeight / 2
          }

          chipPlacements[req.chipId] = {
            x: placeX,
            y: placeY,
            ccwRotationDegrees: 0,
          }

          currentX = placeX + satWidth / 2
        }
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (!this.layout) {
      return visualizeInputProblem(this.partitionInputProblem, {
        chipPlacements: {},
        groupPlacements: {},
      })
    }
    return visualizeInputProblem(this.partitionInputProblem, this.layout)
  }

  override getConstructorParams(): [any] {
    return [
      {
        partitionInputProblem: this.partitionInputProblem,
        pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
      },
    ]
  }
}
