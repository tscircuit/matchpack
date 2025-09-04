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
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"
import { getPadsBoundingBox } from "./getPadsBoundingBox"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

const PIN_SIZE = 0.1

export class SingleInnerPartitionPackingSolver extends BaseSolver {
  inputProblem: InputProblem
  layout: OutputLayout | null = null
  declare activeSubSolver: PackSolver2 | null

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
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
    // If any direct (strong) pin-to-pin connections exist in this partition,
    // optimize placement using only those direct connections. Otherwise, fall
    // back to filtered net-based connectivity.
    const strongPairs = new Set<string>()
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [a, b] = connKey.split("-")
      if (!a || !b) continue
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      strongPairs.add(key)
    }
    const hasStrongConnections = strongPairs.size > 0

    let pinToNetworkMap: Map<string, string>
    if (hasStrongConnections) {
      pinToNetworkMap = new Map<string, string>()
      // Map both pins in each strong pair to the same normalized network id
      for (const key of strongPairs) {
        const [a, b] = key.split("-")
        const netId = key
        if (a) pinToNetworkMap.set(a, netId)
        if (b) pinToNetworkMap.set(b, netId)
      }
      // Ensure all remaining pins are isolated so they don't influence placement
      for (const pinId of Object.keys(this.inputProblem.chipPinMap)) {
        if (!pinToNetworkMap.has(pinId)) {
          pinToNetworkMap.set(pinId, `${pinId}_isolated`)
        }
      }
    } else {
      // Fall back to filtered mapping (weak + strong)
      pinToNetworkMap =
        createFilteredNetworkMapping(this.inputProblem).pinToNetworkMap
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
      const basicLayout = doBasicInputProblemLayout(this.inputProblem)
      return visualizeInputProblem(this.inputProblem, basicLayout)
    }

    return visualizeInputProblem(this.inputProblem, this.layout)
  }

  override getConstructorParams(): [InputProblem] {
    return [this.inputProblem]
  }
}
