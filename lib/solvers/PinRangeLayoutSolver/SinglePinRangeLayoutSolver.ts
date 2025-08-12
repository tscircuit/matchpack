/**
 * Solves the layout for a single pin range and its connected passive components.
 * This solver takes a pin range and applies layout patterns to position the
 * connected components optimally around the pin range.
 */

import type { GraphicsObject } from "graphics-debug"
import { pack, type PackInput } from "calculate-packing"
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

  /**
   * Build a connectivity map that normalizes network IDs by finding connected components.
   * All pins in the same connected component get the same network ID.
   */
  protected buildNetworkConnectivityMap(
    relevantPins: Set<string>,
  ): Map<string, string> {
    // Build adjacency list from strong connections
    const adjacency = new Map<string, Set<string>>()

    // Initialize adjacency list
    for (const pinId of relevantPins) {
      adjacency.set(pinId, new Set())
    }

    // Add edges from strong connections
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (connected) {
        const [pin1Id, pin2Id] = connKey.split("-")
        if (
          pin1Id &&
          pin2Id &&
          relevantPins.has(pin1Id) &&
          relevantPins.has(pin2Id)
        ) {
          adjacency.get(pin1Id)?.add(pin2Id)
          adjacency.get(pin2Id)?.add(pin1Id)
        }
      }
    }

    // Find connected components using DFS
    const visited = new Set<string>()
    const networkMap = new Map<string, string>()

    const dfs = (pinId: string, networkId: string) => {
      if (visited.has(pinId)) return
      visited.add(pinId)
      networkMap.set(pinId, networkId)

      const neighbors = adjacency.get(pinId)
      if (neighbors) {
        for (const neighbor of neighbors) {
          dfs(neighbor, networkId)
        }
      }
    }

    // Process each unvisited pin
    for (const pinId of relevantPins) {
      if (!visited.has(pinId)) {
        // Use the lexicographically smallest pin ID as the network ID for consistency
        const component = new Set<string>()
        const findComponent = (id: string) => {
          if (component.has(id)) return
          component.add(id)
          const neighbors = adjacency.get(id)
          if (neighbors) {
            for (const neighbor of neighbors) {
              findComponent(neighbor)
            }
          }
        }
        findComponent(pinId)

        const networkId = Array.from(component).sort()[0] || pinId
        dfs(pinId, networkId)
      }
    }

    return networkMap
  }

  protected createPinRangeLayout(): OutputLayout {
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

    // Build network connectivity map for all relevant pins
    const relevantPins = new Set<string>()
    for (const chipId of relevantChipIds) {
      const chip = this.inputProblem.chipMap[chipId]!
      for (const pinId of chip.pins) {
        relevantPins.add(pinId)
      }
    }

    const networkMap = this.buildNetworkConnectivityMap(relevantPins)

    // Identify networks that should be preserved (those involving pin range pins and their connected chips)
    const preservedNetworks = new Set<string>()
    const pinRangePins = new Set(this.pinRange.pinIds)
    const connectedChips = new Set(this.pinRange.connectedChips || [])

    // Find the chip containing the pin range
    let pinRangeChipId: string | null = null
    for (const pinId of this.pinRange.pinIds) {
      const chipPin = this.inputProblem.chipPinMap[pinId]
      if (chipPin) {
        for (const [chipId, chip] of Object.entries(
          this.inputProblem.chipMap,
        )) {
          if (chip.pins.includes(pinId)) {
            pinRangeChipId = chipId
            break
          }
        }
        if (pinRangeChipId) break
      }
    }

    // Only preserve networks where:
    // 1. At least one pin is a pin range pin, AND
    // 2. All other pins in the network are either pin range pins or connected chip pins

    // Group pins by network
    const networkToPins = new Map<string, string[]>()
    for (const [pinId, networkId] of networkMap.entries()) {
      if (!networkToPins.has(networkId)) {
        networkToPins.set(networkId, [])
      }
      networkToPins.get(networkId)!.push(pinId)
    }

    for (const [networkId, pinsInNetwork] of networkToPins.entries()) {
      // Check if this network has any pin range pins
      const hasPinRangePin = pinsInNetwork.some((pinId) =>
        pinRangePins.has(pinId),
      )

      if (hasPinRangePin) {
        // Check if all pins in this network are either:
        // - Pin range pins, OR
        // - Connected chip pins
        const allPinsAllowed = pinsInNetwork.every((pinId) => {
          if (pinRangePins.has(pinId)) return true // Pin range pin is allowed

          // Find which chip this pin belongs to
          for (const [chipId, chip] of Object.entries(
            this.inputProblem.chipMap,
          )) {
            if (chip.pins.includes(pinId)) {
              return connectedChips.has(chipId) // Allow if from connected chip
            }
          }
          return false
        })

        if (allPinsAllowed) {
          preservedNetworks.add(networkId)
        }
      }
    }

    // Counter for disconnected network IDs
    let disconnectedCounter = 0

    // Convert relevant chips to calculate-packing format
    const components = Array.from(relevantChipIds).map((chipId) => {
      const chip = this.inputProblem.chipMap[chipId]!
      const chipPins = chip.pins.map(
        (pinId) => this.inputProblem.chipPinMap[pinId]!,
      )

      // Convert pins to pads with network information
      const pads = chipPins.map((pin) => {
        // Get normalized network ID from connectivity map
        let networkId = networkMap.get(pin.pinId) || pin.pinId

        // Determine if this specific pin should keep its network connection
        const isPinRangePin = pinRangePins.has(pin.pinId)

        // Find which chip this pin belongs to
        let pinChipId: string | null = null
        for (const [chipId, chip] of Object.entries(
          this.inputProblem.chipMap,
        )) {
          if (chip.pins.includes(pin.pinId)) {
            pinChipId = chipId
            break
          }
        }
        const isConnectedChipPin = pinChipId && connectedChips.has(pinChipId)

        // Keep network ID if:
        // 1. This is a pin range pin AND the network connects to connected chips, OR
        // 2. This is a connected chip pin AND the network involves pin range pins
        let shouldPreserveNetwork = false

        if (isPinRangePin || isConnectedChipPin) {
          // Check if this network connects pin range pins to connected chip pins
          const pinsInThisNetwork = Array.from(networkMap.entries())
            .filter(([, netId]) => netId === networkId)
            .map(([pinId]) => pinId)

          const hasPinRangePin = pinsInThisNetwork.some((pinId) =>
            pinRangePins.has(pinId),
          )
          const hasConnectedChipPin = pinsInThisNetwork.some((pinId) => {
            for (const [chipId, chip] of Object.entries(
              this.inputProblem.chipMap,
            )) {
              if (chip.pins.includes(pinId)) {
                return connectedChips.has(chipId)
              }
            }
            return false
          })

          // Preserve if this network connects pin range pins to connected chips
          if (
            hasPinRangePin &&
            hasConnectedChipPin &&
            (isPinRangePin || isConnectedChipPin)
          ) {
            shouldPreserveNetwork = true
          }
        }

        if (!shouldPreserveNetwork) {
          networkId = `disconnected_${disconnectedCounter++}`
        }

        return {
          padId: pin.pinId,
          networkId,
          type: "rect" as const,
          offset: pin.offset,
          size: { x: 0.05, y: 0.05 },
        }
      })

      // Create inner body pad with disconnected network ID (bodies don't connect to networks)
      pads.push({
        padId: `${chipId}-body`,
        networkId: `disconnected_${disconnectedCounter++}`,
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
    const packInput: PackInput = {
      components,
      minGap: this.inputProblem.chipGap, // Use chipGap from input problem
      packOrderStrategy: "largest_to_smallest" as const,
      packPlacementStrategy: "minimum_sum_squared_distance_to_network",
    }

    const packResult = pack(packInput)

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
              // Rotate pin offset around chip center based on chip rotation
              const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
              const cos = Math.cos(angleRad)
              const sin = Math.sin(angleRad)
              const rotatedOffset = {
                x: offset.x * cos - offset.y * sin,
                y: offset.x * sin + offset.y * cos,
              }
              return {
                x: placement.x + rotatedOffset.x,
                y: placement.y + rotatedOffset.y,
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
