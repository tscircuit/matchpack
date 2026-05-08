/**
 * Packs components within a single partition to create an optimal internal layout.
 * Uses a packing algorithm to arrange chips and their connections within the partition.
 */

import type { GraphicsObject } from "graphics-debug"
import { type PackInput, PackSolver2 } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  InputProblem,
  PinId,
  ChipId,
  NetId,
  ChipPin,
  PartitionInputProblem,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"
import { getPadsBoundingBox } from "./getPadsBoundingBox"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

const PIN_SIZE = 0.1

export class SingleInnerPartitionPackingSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null
  declare activeSubSolver: PackSolver2 | null
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>

  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.pinIdToStronglyConnectedPins = params.pinIdToStronglyConnectedPins
  }

  override _step() {
    // Initialize PackSolver2 if not already created
    if (!this.activeSubSolver) {
      const packInput = this.createPackInput()
      this.activeSubSolver = new PackSolver2(packInput)
      this.activeSubSolver = this.activeSubSolver
    }

    // Run one step of the PackSolver2
    this.activeSubSolver.step()

    if (this.activeSubSolver.failed) {
      this.failed = true
      this.error = `PackSolver2 failed: ${this.activeSubSolver.error}`
      return
    }

    if (this.activeSubSolver.solved) {
      // Apply the packing result to create the layout
      this.layout = this.createLayoutFromPackingResult(
        this.activeSubSolver.packedComponents,
      )
      this.solved = true
      this.activeSubSolver = null
    }
  }

  private createPackInput(): PackInput {
    // Special handling for decoupling capacitors
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      return this.createDecouplingCapPackInput()
    }

    // Fall back to filtered mapping (weak + strong) for non-decoupling partitions
    const pinToNetworkMap = createFilteredNetworkMapping({
      inputProblem: this.partitionInputProblem,
      pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
    }).pinToNetworkMap

    // Create pack components for each chip
    const packComponents = Object.entries(
      this.partitionInputProblem.chipMap,
    ).map(([chipId, chip]) => {
      // Create pads for all pins of this chip
      const pads: Array<{
        padId: string
        networkId: string
        type: "rect"
        offset: { x: number; y: number }
        size: { x: number; y: number }
      }> = []

      // Create a pad for each pin on this chip
      for (const pinId of chip.pins) {
        const pin = this.partitionInputProblem.chipPinMap[pinId]
        if (!pin) continue

        // Find network for this pin from our connectivity map
        const networkId = pinToNetworkMap.get(pinId) || `${pinId}_isolated`

        pads.push({
          padId: pinId,
          networkId: networkId,
          type: "rect" as const,
          offset: { x: pin.offset.x, y: pin.offset.y },
          size: { x: PIN_SIZE, y: PIN_SIZE }, // Small size for pins
        })
      }

      const padsBoundingBox = getPadsBoundingBox(pads)
      const padsBoundingBoxSize = {
        x: padsBoundingBox.maxX - padsBoundingBox.minX,
        y: padsBoundingBox.maxY - padsBoundingBox.minY,
      }

      // Add chip body pad (disconnected from any network) but make sure
      // it fully envelopes the "pads" (pins)

      pads.push({
        padId: `${chipId}_body`,
        networkId: `${chipId}_body_disconnected`,
        type: "rect" as const,
        offset: { x: 0, y: 0 },
        size: {
          x: Math.max(padsBoundingBoxSize.x, chip.size.x),
          y: Math.max(padsBoundingBoxSize.y, chip.size.y),
        },
      })

      return {
        componentId: chipId,
        pads,
        availableRotationDegrees: chip.availableRotations || [0, 90, 180, 270],
      }
    })

    let minGap = this.partitionInputProblem.chipGap
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      minGap = this.partitionInputProblem.decouplingCapsGap ?? minGap
    }

    return {
      components: packComponents,
      minGap,
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_closest_sum_squared_distance",
    }
  }

  /**
   * Specialized layout algorithm for decoupling capacitors
   * Creates a clean, standardized layout for decoupling capacitors
   */
  private createDecouplingCapPackInput(): PackInput {
    // Get all chips in this partition
    const chipEntries = Object.entries(this.partitionInputProblem.chipMap)
    const chips = chipEntries.map(([_, chip]) => chip)

    // Find the most common net pairs (power and ground) among the capacitors
    const netPairs: Record<string, {powerNet: string, groundNet: string, count: number}> = {}

    for (const chip of chips) {
      if (chip.pins.length !== 2) continue

      const pin1 = this.partitionInputProblem.chipPinMap[chip.pins[0]]
      const pin2 = this.partitionInputProblem.chipPinMap[chip.pins[1]]

      if (!pin1 || !pin2) continue

      // Get the nets connected to these pins
      const net1 = this.getNetForPin(chip.pins[0])
      const net2 = this.getNetForPin(chip.pins[1])

      if (!net1 || !net2) continue

      // Determine which net is power and which is ground
      const net1IsPower = this.partitionInputProblem.netMap[net1]?.isPositiveVoltageSource
      const net2IsPower = this.partitionInputProblem.netMap[net2]?.isPositiveVoltageSource

      let powerNet, groundNet

      if (net1IsPower && !net2IsPower) {
        powerNet = net1
        groundNet = net2
      } else if (net2IsPower && !net1IsPower) {
        powerNet = net2
        groundNet = net1
      } else {
        continue // Skip if we can't determine power/ground
      }

      const key = `${powerNet}-${groundNet}`
      if (!netPairs[key]) {
        netPairs[key] = { powerNet, groundNet, count: 0 }
      }
      netPairs[key].count++
    }

    // Find the most common net pair
    let mostCommonPair = null
    let maxCount = 0

    for (const key in netPairs) {
      if (netPairs[key].count > maxCount) {
        mostCommonPair = netPairs[key]
        maxCount = netPairs[key].count
      }
    }

    if (!mostCommonPair) {
      // Fall back to default packing if we can't determine net pairs
      return this.createDefaultPackInput()
    }

    // Create pack components with specialized layout for decoupling caps
    const packComponents = chipEntries.map(([chipId, chip]) => {
      // Create pads for all pins of this chip
      const pads: Array<{
        padId: string
        networkId: string
        type: "rect"
        offset: { x: number; y: number }
        size: { x: number; y: number }
      }> = []

      // Create a pad for each pin on this chip
      for (const pinId of chip.pins) {
        const pin = this.partitionInputProblem.chipPinMap[pinId]
        if (!pin) continue

        // Find network for this pin
        const networkId = this.getNetForPin(pinId) || `${pinId}_isolated`

        pads.push({
          padId: pinId,
          networkId: networkId,
          type: "rect" as const,
          offset: { x: pin.offset.x, y: pin.offset.y },
          size: { x: PIN_SIZE, y: PIN_SIZE },
        })
      }

      const padsBoundingBox = getPadsBoundingBox(pads)
      const padsBoundingBoxSize = {
        x: padsBoundingBox.maxX - padsBoundingBox.minX,
        y: padsBoundingBox.maxY - padsBoundingBox.minY,
      }

      // Add chip body pad
      pads.push({
        padId: `${chipId}_body`,
        networkId: `${chipId}_body_disconnected`,
        type: "rect" as const,
        offset: { x: 0, y: 0 },
        size: {
          x: Math.max(padsBoundingBoxSize.x, chip.size.x),
          y: Math.max(padsBoundingBoxSize.y, chip.size.y),
        },
      })

      return {
        componentId: chipId,
        pads,
        // For decoupling caps, we typically want to restrict rotation to 0 or 180 degrees
        // to maintain consistent orientation
        availableRotationDegrees: chip.availableRotations || [0, 180],
      }
    })

    // Use a specialized packing strategy for decoupling capacitors
    return {
      components: packComponents,
      minGap: this.partitionInputProblem.decouplingCapsGap || this.partitionInputProblem.chipGap,
      packOrderStrategy: "largest_to_smallest",
      // Use a specialized placement strategy for decoupling caps
      packPlacementStrategy: "decoupling_capacitor_layout",
    }
  }

  /**
   * Helper method to get the net for a pin
   */
  private getNetForPin(pinId: PinId): NetId | null {
    for (const [connKey, isConnected] of Object.entries(
      this.partitionInputProblem.netConnMap,
    )) {
      if (!isConnected) continue
      const [pin, net] = connKey.split("-") as [PinId, NetId]
      if (pin === pinId) return net
    }
    return null
  }

  /**
   * Fallback to default packing if specialized layout can't be determined
   */
  private createDefaultPackInput(): PackInput {
    const pinToNetworkMap = createFilteredNetworkMapping({
      inputProblem: this.partitionInputProblem,
      pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
    }).pinToNetworkMap

    const packComponents = Object.entries(
      this.partitionInputProblem.chipMap,
    ).map(([chipId, chip]) => {
      const pads: Array<{
        padId: string
        networkId: string
        type: "rect"
        offset: { x: number; y: number }
        size: { x: number; y: number }
      }> = []

      for (const pinId of chip.pins) {
        const pin = this.partitionInputProblem.chipPinMap[pinId]
        if (!pin) continue

        const networkId = pinToNetworkMap.get(pinId) || `${pinId}_isolated`

        pads.push({
          padId: pinId,
          networkId: networkId,
          type: "rect" as const,
          offset: { x: pin.offset.x, y: pin.offset.y },
          size: { x: PIN_SIZE, y: PIN_SIZE },
        })
      }

      const padsBoundingBox = getPadsBoundingBox(pads)
      const padsBoundingBoxSize = {
        x: padsBoundingBox.maxX - padsBoundingBox.minX,
        y: padsBoundingBox.maxY - padsBoundingBox.minY,
      }

      pads.push({
        padId: `${chipId}_body`,
        networkId: `${chipId}_body_disconnected`,
        type: "rect" as const,
        offset: { x: 0, y: 0 },
        size: {
          x: Math.max(padsBoundingBoxSize.x, chip.size.x),
          y: Math.max(padsBoundingBoxSize.y, chip.size.y),
        },
      })

      return {
        componentId: chipId,
        pads,
        availableRotationDegrees: chip.availableRotations || [0, 90, 180, 270],
      }
    })

    return {
      components: packComponents,
      minGap: this.partitionInputProblem.decouplingCapsGap || this.partitionInputProblem.chipGap,
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_closest_sum_squared_distance",
    }
  }

  private createLayoutFromPackingResult(
    packedComponents: PackSolver2["packedComponents"],
  ): OutputLayout {
    // Special handling for decoupling capacitors
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      return this.createDecouplingCapLayout(packedComponents)
    }

    // Default handling for other components
    const chipPlacements: Record<string, Placement> = {}

    for (const packedComponent of packedComponents) {
      const chipId = packedComponent.componentId

      chipPlacements[chipId] = {
        x: packedComponent.center.x,
        y: packedComponent.center.y,
        ccwRotationDegrees:
          packedComponent.ccwRotationOffset ||
          packedComponent.ccwRotationDegrees ||
          0,
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  /**
   * Creates a specialized layout for decoupling capacitors
   * Aligns capacitors in a clean, standardized format
   */
  private createDecouplingCapLayout(
    packedComponents: PackSolver2["packedComponents"],
  ): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}

    // Get all chips in this partition
    const chipEntries = Object.entries(this.partitionInputProblem.chipMap)
    const chips = chipEntries.map(([_, chip]) => chip)

    // Find the most common net pairs (power and ground) among the capacitors
    const netPairs: Record<string, {powerNet: string, groundNet: string, count: number}> = {}

    for (const chip of chips) {
      if (chip.pins.length !== 2) continue

      const pin1 = this.partitionInputProblem.chipPinMap[chip.pins[0]]
      const pin2 = this.partitionInputProblem.chipPinMap[chip.pins[1]]

      if (!pin1 || !pin2) continue

      // Get the nets connected to these pins
      const net1 = this.getNetForPin(chip.pins[0])
      const net2 = this.getNetForPin(chip.pins[1])

      if (!net1 || !net2) continue

      // Determine which net is power and which is ground
      const net1IsPower = this.partitionInputProblem.netMap[net1]?.isPositiveVoltageSource
      const net2IsPower = this.partitionInputProblem.netMap[net2]?.isPositiveVoltageSource

      let powerNet, groundNet

      if (net1IsPower && !net2IsPower) {
        powerNet = net1
        groundNet = net2
      } else if (net2IsPower && !net1IsPower) {
        powerNet = net2
        groundNet = net1
      } else {
        continue // Skip if we can't determine power/ground
      }

      const key = `${powerNet}-${groundNet}`
      if (!netPairs[key]) {
        netPairs[key] = { powerNet, groundNet, count: 0 }
      }
      netPairs[key].count++
    }

    // Find the most common net pair
    let mostCommonPair = null
    let maxCount = 0

    for (const key in netPairs) {
      if (netPairs[key].count > maxCount) {
        mostCommonPair = netPairs[key]
        maxCount = netPairs[key].count
      }
    }

    if (!mostCommonPair) {
      // Fall back to default layout if we can't determine net pairs
      for (const packedComponent of packedComponents) {
        const chipId = packedComponent.componentId
        chipPlacements[chipId] = {
          x: packedComponent.center.x,
          y: packedComponent.center.y,
          ccwRotationDegrees:
            packedComponent.ccwRotationOffset ||
            packedComponent.ccwRotationDegrees ||
            0,
        }
      }
      return {
        chipPlacements,
        groupPlacements: {},
      }
    }

    // Get all chips that belong to the most common net pair
    const relevantChips: Array<{chipId: string, chip: any, powerPin: string, groundPin: string}> = []

    for (const [chipId, chip] of chipEntries) {
      if (chip.pins.length !== 2) continue

      const pin1 = this.partitionInputProblem.chipPinMap[chip.pins[0]]
      const pin2 = this.partitionInputProblem.chipPinMap[chip.pins[1]]

      if (!pin1 || !pin2) continue

      const net1 = this.getNetForPin(chip.pins[0])
      const net2 = this.getNetForPin(chip.pins[1])

      if (!net1 || !net2) continue

      const net1IsPower = this.partitionInputProblem.netMap[net1]?.isPositiveVoltageSource
      const net2IsPower = this.partitionInputProblem.netMap[net2]?.isPositiveVoltageSource

      if ((net1 === mostCommonPair.powerNet && net2 === mostCommonPair.groundNet) ||
          (net2 === mostCommonPair.powerNet && net1 === mostCommonPair.groundNet)) {
        relevantChips.push({
          chipId,
          chip,
          powerPin: net1IsPower ? chip.pins[0] : chip.pins[1],
          groundPin: net1IsPower ? chip.pins[1] : chip.pins[0]
        })
      }
    }

    // Sort chips by size (largest to smallest)
    relevantChips.sort((a, b) => {
      const sizeA = a.chip.size.x * a.chip.size.y
      const sizeB = b.chip.size.x * b.chip.size.y
      return sizeB - sizeA // Descending order
    })

    // Calculate layout for decoupling capacitors
    // We'll arrange them in a row with consistent spacing
    const minGap = this.partitionInputProblem.decouplingCapsGap || this.partitionInputProblem.chipGap
    const chipHeight = Math.max(...relevantChips.map(c => c.chip.size.y))
    const chipWidth = Math.max(...relevantChips.map(c => c.chip.size.x))

    // Determine layout direction (default to horizontal)
    const layoutDirection = this.partitionInputProblem.decouplingCapsLayoutDirection || "horizontal"

    // Start position
    let x = 0
    let y = 0

    // Place each capacitor in a row
    for (let i = 0; i < relevantChips.length; i++) {
      const chip = relevantChips[i]
      const chipId = chip.chipId

      if (layoutDirection === "horizontal") {
        // Horizontal layout - place chips side by side
        chipPlacements[chipId] = {
          x: x + chipWidth / 2,
          y: y,
          ccwRotationDegrees: 0, // Keep consistent orientation
        }

        // Update x position for next chip
        x += chipWidth + minGap
      } else {
        // Vertical layout - stack chips vertically
        chipPlacements[chipId] = {
          x: x,
          y: y + chipHeight / 2,
          ccwRotationDegrees: 0, // Keep consistent orientation
        }

        // Update y position for next chip
        y += chipHeight + minGap
      }
    }

    // For any chips not in the most common net pair, use the default packed positions
    for (const packedComponent of packedComponents) {
      const chipId = packedComponent.componentId
      if (!chipPlacements[chipId]) {
        chipPlacements[chipId] = {
          x: packedComponent.center.x,
          y: packedComponent.center.y,
          ccwRotationDegrees:
            packedComponent.ccwRotationOffset ||
            packedComponent.ccwRotationDegrees ||
            0,
        }
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
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
