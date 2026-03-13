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

  private macroComponents: Map<
    string,
    {
      mainChipId: ChipId
      caps: Array<{
        chipId: ChipId
        relX: number
        relY: number
        rotation: number
      }>
    }
  > = new Map()

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
    // Fall back to filtered mapping (weak + strong)
    const pinToNetworkMap = createFilteredNetworkMapping({
      inputProblem: this.partitionInputProblem,
      pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
    }).pinToNetworkMap

    const handledChipIds = new Set<ChipId>()
    const packComponents: any[] = []

    // Group decap groups by mainChipId
    const groupsByMainChip = new Map<ChipId, any[]>()
    for (const group of this.partitionInputProblem.decouplingCapGroups || []) {
      if (!groupsByMainChip.has(group.mainChipId))
        groupsByMainChip.set(group.mainChipId, [])
      groupsByMainChip.get(group.mainChipId)!.push(group)
    }

    const gap = this.partitionInputProblem.decouplingCapsGap || 0.2

    for (const [mainChipId, groups] of groupsByMainChip.entries()) {
      const mainChip = this.partitionInputProblem.chipMap[mainChipId]
      if (!mainChip) continue

      const macroPads: any[] = []
      const capsInMacro: any[] = []

      // Add main chip pads
      for (const pinId of mainChip.pins) {
        const pin = this.partitionInputProblem.chipPinMap[pinId]
        if (!pin) continue
        const networkId = pinToNetworkMap.get(pinId) || `${pinId}_isolated`
        macroPads.push({
          padId: pinId,
          networkId: networkId,
          type: "rect" as const,
          offset: { x: pin.offset.x, y: pin.offset.y },
          size: { x: PIN_SIZE, y: PIN_SIZE },
        })
      }
      // Add main chip body
      macroPads.push({
        padId: `${mainChipId}_body`,
        networkId: `${mainChipId}_body_disconnected`,
        type: "rect" as const,
        offset: { x: 0, y: 0 },
        size: { x: mainChip.size.x, y: mainChip.size.y },
      })

      // Add caps
      for (const group of groups) {
        for (const capChipId of group.decouplingCapChipIds) {
          const cap = this.partitionInputProblem.chipMap[capChipId]
          const { mainPinId, capPinId } = group.capToMainPinMap[capChipId]
          const mainPin = this.partitionInputProblem.chipPinMap[mainPinId]
          const capPin = this.partitionInputProblem.chipPinMap[capPinId]
          if (!cap || !mainPin || !capPin) continue

          // Align the capacitor pin with the main chip pin, adding a gap
          // We want: relPos + capPin.offset = mainPin.offset + sideVector * gap
          let relX = mainPin.offset.x - capPin.offset.x
          let relY = mainPin.offset.y - capPin.offset.y

          if (mainPin.side === "x-") relX -= gap
          else if (mainPin.side === "x+") relX += gap
          else if (mainPin.side === "y-") relY -= gap
          else if (mainPin.side === "y+") relY += gap

          capsInMacro.push({ chipId: capChipId, relX, relY, rotation: 0 })

          // Add cap pads to macro
          for (const cPinId of cap.pins) {
            const cPin = this.partitionInputProblem.chipPinMap[cPinId]
            if (!cPin) continue
            const networkId =
              pinToNetworkMap.get(cPinId) || `${cPinId}_isolated`
            macroPads.push({
              padId: cPinId,
              networkId: networkId,
              type: "rect" as const,
              offset: { x: relX + cPin.offset.x, y: relY + cPin.offset.y },
              size: { x: PIN_SIZE, y: PIN_SIZE },
            })
          }
          // Add cap body to macro
          macroPads.push({
            padId: `${capChipId}_body`,
            networkId: `${capChipId}_body_disconnected`,
            type: "rect" as const,
            offset: { x: relX, y: relY },
            size: { x: cap.size.x, y: cap.size.y },
          })

          handledChipIds.add(capChipId)
        }
      }

      packComponents.push({
        componentId: `macro_${mainChipId}`,
        pads: macroPads,
        availableRotationDegrees: mainChip.availableRotations || [
          0, 90, 180, 270,
        ],
      })
      handledChipIds.add(mainChipId)
      this.macroComponents.set(`macro_${mainChipId}`, {
        mainChipId,
        caps: capsInMacro,
      })
    }

    // Create pack components for each remaining chip
    const remainingChips = Object.entries(
      this.partitionInputProblem.chipMap,
    ).filter(([chipId]) => !handledChipIds.has(chipId))

    for (const [chipId, chip] of remainingChips) {
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

      packComponents.push({
        componentId: chipId,
        pads,
        availableRotationDegrees: chip.availableRotations || [0, 90, 180, 270],
      })
    }

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
      const compId = packedComponent.componentId
      const x = packedComponent.center.x
      const y = packedComponent.center.y
      const rot =
        packedComponent.ccwRotationOffset ||
        packedComponent.ccwRotationDegrees ||
        0

      if (compId.startsWith("macro_")) {
        const macro = this.macroComponents.get(compId)!
        // Main chip is at (x, y) with rotation rot
        chipPlacements[macro.mainChipId] = { x, y, ccwRotationDegrees: rot }

        // Caps are at relative positions
        for (const cap of macro.caps) {
          // Rotate relative offset
          const rad = (rot * Math.PI) / 180
          const cos = Math.cos(rad)
          const sin = Math.sin(rad)
          const rotatedX = cap.relX * cos - cap.relY * sin
          const rotatedY = cap.relX * sin + cap.relY * cos

          chipPlacements[cap.chipId] = {
            x: x + rotatedX,
            y: y + rotatedY,
            ccwRotationDegrees: (cap.rotation + rot) % 360,
          }
        }
      } else {
        chipPlacements[compId] = {
          x,
          y,
          ccwRotationDegrees: rot,
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
