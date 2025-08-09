/**
 * Solves the layout for a single pin range and its connected passive components.
 * This solver takes a pin range and applies layout patterns to position the
 * connected components optimally around the pin range.
 */

import type { GraphicsObject } from "graphics-debug"
import { pack } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { PinRange } from "../PinRangeMatchSolver/PartitionPinRangeMatchSolver/PartitionPinRangeMatchSolver"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export class SinglePinRangeLayoutSolver extends BaseSolver {
  pinRange: PinRange
  inputProblem: InputProblem
  layoutApplied = false
  layout: OutputLayout | null = null

  constructor(pinRange: PinRange, inputProblem: InputProblem) {
    super()
    this.pinRange = pinRange
    this.inputProblem = inputProblem
  }

  override _step() {
    try {
      this.layout = this.createPinRangeLayout()
      this.layoutApplied = true
      this.solved = true
    } catch (error) {
      this.failed = true
      this.error = `Failed to create pin range layout: ${error}`
    }
  }

  private createPinRangeLayout(): OutputLayout {
    // Create a focused InputProblem containing only the pin range chip and connected passives
    const relevantChipIds = new Set<string>()

    // Add the chip containing the pin range
    for (const pinId of this.pinRange.pinIds) {
      const chipPin = this.inputProblem.chipPinMap[pinId]
      if (chipPin) {
        // Find which chip this pin belongs to
        for (const [chipId, chip] of Object.entries(
          this.inputProblem.chipMap,
        )) {
          if (chip.pins.includes(pinId)) {
            relevantChipIds.add(chipId)
            break
          }
        }
      }
    }

    // Add connected passive chips
    if (this.pinRange.connectedChips) {
      for (const chipId of this.pinRange.connectedChips) {
        relevantChipIds.add(chipId)
      }
    }

    // Convert relevant chips to calculate-packing format
    const components = Array.from(relevantChipIds).map((chipId) => {
      const chip = this.inputProblem.chipMap[chipId]!
      const chipPins = chip.pins.map(
        (pinId) => this.inputProblem.chipPinMap[pinId]!,
      )

      // Convert pins to pads with network information
      const pads = chipPins.map((pin) => {
        // Find which network this pin connects to using strong connections
        let networkId = pin.pinId // Default to unique network per pin

        // Look for strong connections to this pin
        for (const [connKey, connected] of Object.entries(
          this.inputProblem.pinStrongConnMap,
        )) {
          if (connected && connKey.includes(pin.pinId)) {
            const [pin1Id, pin2Id] = connKey.split("-")
            if (pin1Id === pin.pinId || pin2Id === pin.pinId) {
              // Create connectivity key from sorted pin IDs
              networkId = [pin1Id, pin2Id].sort().join("_")
              break
            }
          }
        }

        return {
          padId: pin.pinId,
          networkId,
          type: "rect" as const,
          offset: pin.offset,
          size: { x: 0.001, y: 0.001 }, // Small pad size
        }
      })

      // Create inner body pad
      pads.push({
        padId: `${chipId}-body`,
        networkId: chipId,
        type: "rect" as const,
        offset: { x: 0, y: 0 },
        size: { x: chip.size.x, y: chip.size.y },
      })

      return {
        componentId: chipId,
        pads,
      }
    })

    if (components.length === 0) {
      return {
        chipPlacements: {},
        groupPlacements: {},
      }
    }

    // Pack components with tighter spacing for pin range layouts
    const packResult = pack({
      components,
      minGap: 0.2, // Tighter gap than general layout
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "shortest_connection_along_outline",
    })

    // Convert pack result to OutputLayout
    const chipPlacements: Record<
      string,
      { x: number; y: number; ccwRotationDegrees: number }
    > = {}

    for (const component of packResult.components) {
      chipPlacements[component.componentId] = {
        x: component.center.x,
        y: component.center.y,
        ccwRotationDegrees: component.ccwRotationOffset,
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (!this.layoutApplied || !this.layout) {
      return super.visualize()
    }

    // Use our calculated layout for visualization
    const baseViz = visualizeInputProblem(this.inputProblem, this.layout)

    // Highlight this specific pin range
    const rangePositions = this.pinRange.pinIds
      .map((pinId) => {
        const chipPin = this.inputProblem.chipPinMap[pinId]
        const groupPin = this.inputProblem.groupPinMap[pinId]
        const offset = chipPin?.offset || groupPin?.offset

        if (offset && chipPin) {
          // Find chip placement to get absolute position
          const chipId = Object.entries(this.inputProblem.chipMap).find(
            ([, chip]) => chip.pins.includes(pinId),
          )?.[0]

          if (chipId && this.layout) {
            const placement = this.layout.chipPlacements[chipId]
            if (placement) {
              return {
                x: placement.x + offset.x,
                y: placement.y + offset.y,
              }
            }
          }
        }
        return offset
      })
      .filter((pos) => pos !== null && pos !== undefined)

    const highlightRects = []
    const connectionLines = []

    // Main pin range highlighting
    if (rangePositions.length > 0) {
      const xs = rangePositions.map((p) => p!.x)
      const ys = rangePositions.map((p) => p!.y)
      const minX = Math.min(...xs) - 0.1
      const maxX = Math.max(...xs) + 0.1
      const minY = Math.min(...ys) - 0.1
      const maxY = Math.max(...ys) + 0.1

      const rangeCenterX = (minX + maxX) / 2
      const rangeCenterY = (minY + maxY) / 2

      highlightRects.push({
        center: { x: rangeCenterX, y: rangeCenterY },
        width: Math.max(0.2, maxX - minX),
        height: Math.max(0.2, maxY - minY),
        strokeColor: "blue",
        fillColor: "rgba(0, 0, 255, 0.1)",
        label: `Pin Range (${this.pinRange.side})`,
      })

      // Highlight connected passive components
      if (
        this.pinRange.connectedChips &&
        this.pinRange.connectedChips.length > 0 &&
        this.layout
      ) {
        for (const connectedChipId of this.pinRange.connectedChips) {
          const placement = this.layout.chipPlacements[connectedChipId]
          const chip = this.inputProblem.chipMap[connectedChipId]

          if (placement && chip) {
            // Connection line
            connectionLines.push({
              points: [
                { x: rangeCenterX, y: rangeCenterY },
                { x: placement.x, y: placement.y },
              ],
              strokeColor: "green",
              strokeDashArray: [5, 5],
            })

            // Connected component highlight
            highlightRects.push({
              center: { x: placement.x, y: placement.y },
              width: chip.size.x + 0.2,
              height: chip.size.y + 0.2,
              strokeColor: "green",
              fillColor: "rgba(0, 255, 0, 0.1)",
              strokeDashArray: [3, 3],
              label: `Connected: ${connectedChipId}`,
            })
          }
        }
      }
    }

    return {
      ...baseViz,
      rects: [...(baseViz.rects || []), ...highlightRects],
      lines: [...(baseViz.lines || []), ...connectionLines],
    }
  }

  override getConstructorParams() {
    return { pinRange: this.pinRange, inputProblem: this.inputProblem }
  }
}
