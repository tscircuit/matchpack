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
    // Check for specialized decoupling capacitor packing
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      this.packDecouplingCaps()
      this.solved = true
      return
    }

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

  private packDecouplingCaps() {
    const caps = Object.values(this.partitionInputProblem.chipMap)
    if (caps.length === 0) {
      this.layout = { chipPlacements: {}, groupPlacements: {} }
      return
    }

    // 1. Identify Main Chip and Sort Order
    // We look for strong connections from the caps to any chip NOT in this partition.
    // Since partitions separate chips, the "main chip" will be outside.
    // However, we only have the partition input problem here.
    // The Strong Connection Map still gives us connectivity info.

    // Map capId -> relevant pin on main chip (we use the first one we find)
    const capToMainPin: Record<string, { pinId: string }> = {}

    for (const cap of caps) {
      for (const pinId of cap.pins) {
        // Check strong connections
        const stronglyConnected = this.pinIdToStronglyConnectedPins[pinId]
        if (stronglyConnected) {
          for (const connectedPin of stronglyConnected) {
            const connectedChipId = connectedPin.pinId.split(".")[0]
            if (
              connectedChipId &&
              !this.partitionInputProblem.chipMap[connectedChipId]
            ) {
              // This connected chip is NOT in our partition, so it's likely the main chip
              if (connectedPin?.pinId) {
                capToMainPin[cap.chipId] = { pinId: connectedPin.pinId }
                break
              }
            }
          }
        }
        if (capToMainPin[cap.chipId]) break
      }
    }

    // Sort caps based on the "main pin" string for now (lexicographical sort of pin ID)
    // A better way would be if we had access to the main chip's pin coordinates,
    // but we don't strictly have the main chip's layout here.
    // However, typically pin names like U3.1, U3.2 follow a sequence.

    // Let's refine the sorting to parse the pin number if possible (e.g. U3.1, U3.2)
    const getPinNumber = (pinId: string): number => {
      const parts = pinId.split(".")
      if (parts.length > 1) {
        const num = parseInt(parts.pop()!)
        if (!isNaN(num)) return num
      }
      return 0
    }

    const sortedCaps = [...caps].sort((a, b) => {
      const pinA = capToMainPin[a.chipId]?.pinId
      const pinB = capToMainPin[b.chipId]?.pinId

      if (pinA && pinB) {
        // If different chips, sort by chip name first
        const chipA = pinA.split(".")[0] || ""
        const chipB = pinB.split(".")[0] || ""
        if (chipA !== chipB) return chipA.localeCompare(chipB)

        // Same chip, sort by pin number
        return getPinNumber(pinA) - getPinNumber(pinB)
      }
      if (pinA) return -1
      if (pinB) return 1
      return a.chipId.localeCompare(b.chipId)
    })

    // 2. Linear Layout
    const chipPlacements: Record<string, Placement> = {}
    let currentX = 0
    const gap = this.partitionInputProblem.decouplingCapsGap ?? 0.2

    for (const cap of sortedCaps) {
      // Assume simple horizontal row for now
      // Center the chip at currentX
      const width = cap.size.x // width usually for rotation 0

      chipPlacements[cap.chipId] = {
        x: currentX + width / 2,
        y: 0,
        ccwRotationDegrees: 0,
      }

      currentX += width + gap
    }

    // Center the whole group around (0,0)
    const totalWidth = currentX - gap
    const offsetX = totalWidth / 2

    for (const placement of Object.values(chipPlacements)) {
      placement.x -= offsetX
    }

    this.layout = {
      chipPlacements,
      groupPlacements: {},
    }
  }

  private createPackInput(): PackInput {
    // Fall back to filtered mapping (weak + strong)
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

  private createLayoutFromPackingResult(
    packedComponents: PackSolver2["packedComponents"],
  ): OutputLayout {
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
