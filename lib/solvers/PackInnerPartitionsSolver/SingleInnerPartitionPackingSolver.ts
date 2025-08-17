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
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"

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
    // Create filtered network mapping to prevent opposite-side weak connections
    // from interfering with strong connections during packing
    const { pinToNetworkMap } = createFilteredNetworkMapping(this.inputProblem)

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
