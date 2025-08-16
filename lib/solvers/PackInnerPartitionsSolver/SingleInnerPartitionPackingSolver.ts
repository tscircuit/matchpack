/**
 * Packs components within a single partition to create an optimal internal layout.
 * Uses a packing algorithm to arrange chips and their connections within the partition.
 */

import type { GraphicsObject } from "graphics-debug"
import { type PackInput, PhasedPackSolver } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  InputProblem,
  PinId,
  ChipId,
  NetId,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export class SingleInnerPartitionPackingSolver extends BaseSolver {
  inputProblem: InputProblem
  layout: OutputLayout | null = null
  phasedPackSolver: PhasedPackSolver | null = null

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
  }

  override _step() {
    try {
      // Initialize PhasedPackSolver if not already created
      if (!this.phasedPackSolver) {
        const packInput = this.createPackInput()
        this.phasedPackSolver = new PhasedPackSolver(packInput)
        this.activeSubSolver = this.phasedPackSolver
      }

      // Run one step of the PhasedPackSolver
      this.phasedPackSolver.step()

      if (this.phasedPackSolver.failed) {
        this.failed = true
        this.error = `PhasedPackSolver failed: ${this.phasedPackSolver.error}`
        return
      }

      if (this.phasedPackSolver.solved) {
        // Apply the packing result to create the layout
        this.layout = this.createLayoutFromPackingResult(
          this.phasedPackSolver.getResult(),
        )
        this.solved = true
        this.activeSubSolver = null
      }
    } catch (error) {
      this.failed = true
      this.error = `Failed to pack partition: ${error}`
    }
  }

  private createPackInput(): PackInput {
    // Build a connectivity map to properly assign networkIds
    const pinToNetworkMap = new Map<string, string>()

    // Process net connections
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const [pinId, netId] = connKey.split("-")
      if (pinId && netId) {
        pinToNetworkMap.set(pinId, netId)
      }
    }

    // Process strong connections - these form their own networks
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const pins = connKey.split("-")
      if (pins.length === 2 && pins[0] && pins[1]) {
        // If either pin already has a net connection, use that network for both
        const existingNet =
          pinToNetworkMap.get(pins[0]) || pinToNetworkMap.get(pins[1])
        if (existingNet) {
          pinToNetworkMap.set(pins[0], existingNet)
          pinToNetworkMap.set(pins[1], existingNet)
        } else {
          // Otherwise, use the connection itself as the network
          pinToNetworkMap.set(pins[0], connKey)
          pinToNetworkMap.set(pins[1], connKey)
        }
      }
    }

    // Create pack components for each chip
    const packComponents = Object.entries(this.inputProblem.chipMap).map(
      ([chipId, chip]) => {
        // Create pads for all pins of this chip
        const pads: Array<{
          padId: string
          networkId: string
          type: "rect"
          offset: { x: number; y: number }
          size: { x: number; y: number }
        }> = []

        // Add chip body pad (disconnected from any network)
        pads.push({
          padId: `${chipId}_body`,
          networkId: `${chipId}_body_disconnected`,
          type: "rect" as const,
          offset: { x: 0, y: 0 },
          size: { x: chip.size.x, y: chip.size.y },
        })

        // Create a pad for each pin on this chip
        for (const pinId of chip.pins) {
          const pin = this.inputProblem.chipPinMap[pinId]
          if (!pin) continue

          // Find network for this pin from our connectivity map
          const networkId = pinToNetworkMap.get(pinId) || `${pinId}_isolated`

          pads.push({
            padId: pinId,
            networkId: networkId,
            type: "rect" as const,
            offset: { x: pin.offset.x, y: pin.offset.y },
            size: { x: 0.1, y: 0.1 }, // Small size for pins
          })
        }

        return {
          componentId: chipId,
          pads,
          availableRotationDegrees: chip.availableRotations || [
            0, 90, 180, 270,
          ],
        }
      },
    )

    return {
      components: packComponents,
      minGap: this.inputProblem.chipGap,
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_sum_squared_distance_to_network",
    }
  }

  private createLayoutFromPackingResult(packedComponents: any[]): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}

    for (const packedComponent of packedComponents) {
      const chipId = packedComponent.componentId

      chipPlacements[chipId] = {
        x: packedComponent.center.x,
        y: packedComponent.center.y,
        ccwRotationDegrees: packedComponent.ccwRotationDegrees || 0,
      }
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (this.phasedPackSolver && !this.solved) {
      return this.phasedPackSolver.visualize()
    }

    if (!this.layout) {
      return super.visualize()
    }

    return visualizeInputProblem(this.inputProblem, this.layout)
  }

  override getConstructorParams(): [InputProblem] {
    return [this.inputProblem]
  }
}
