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
  ChipPin,
  PartitionInputProblem,
} from "../../types/InputProblem"
import type { Side } from "../../types/Side"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"
import { getPadsBoundingBox } from "./getPadsBoundingBox"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"

const PIN_SIZE = 0.1

function getRotatedSide(side: Side, ccwDegrees: 0 | 90 | 180 | 270): Side {
  if (ccwDegrees === 0) return side
  if (ccwDegrees === 90) {
    const map: Record<Side, Side> = {
      "y+": "x-",
      "x-": "y-",
      "y-": "x+",
      "x+": "y+",
    }
    return map[side]
  }
  if (ccwDegrees === 180) {
    const map: Record<Side, Side> = {
      "y+": "y-",
      "y-": "y+",
      "x+": "x-",
      "x-": "x+",
    }
    return map[side]
  }
  // 270° CCW
  const map: Record<Side, Side> = {
    "y+": "x+",
    "x+": "y-",
    "y-": "x-",
    "x-": "y+",
  }
  return map[side]
}

function getVoltageBiasedRotations(
  chip: { pins: string[]; availableRotations?: Array<0 | 90 | 180 | 270> },
  inputProblem: InputProblem,
): Array<0 | 90 | 180 | 270> {
  const baseRotations: Array<0 | 90 | 180 | 270> = chip.availableRotations ?? [
    0, 90, 180, 270,
  ]

  const powerPinSides: Side[] = []
  const groundPinSides: Side[] = []

  for (const connKey of Object.keys(inputProblem.netConnMap)) {
    const dashIdx = connKey.indexOf("-")
    if (dashIdx === -1) continue
    const pinId = connKey.slice(0, dashIdx)
    const netId = connKey.slice(dashIdx + 1)
    if (!chip.pins.includes(pinId)) continue
    const net = inputProblem.netMap[netId]
    if (!net) continue
    const pin = inputProblem.chipPinMap[pinId]
    if (!pin) continue
    if (net.isPositiveVoltageSource) powerPinSides.push(pin.side)
    if (net.isGround) groundPinSides.push(pin.side)
  }

  if (powerPinSides.length === 0 && groundPinSides.length === 0)
    return baseRotations

  // Prefer rotations where power pins are on top (y+) and ground pins on bottom (y-)
  const strictRotations = baseRotations.filter(
    (rot) =>
      powerPinSides.every((s) => getRotatedSide(s, rot) === "y+") &&
      groundPinSides.every((s) => getRotatedSide(s, rot) === "y-"),
  )
  if (strictRotations.length > 0) return strictRotations

  // Relaxed fallback: at least put power pins on top
  const powerOnlyRotations = baseRotations.filter((rot) =>
    powerPinSides.every((s) => getRotatedSide(s, rot) === "y+"),
  )
  if (powerOnlyRotations.length > 0) return powerOnlyRotations

  return baseRotations
}

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
      const pinToNetworkMap = createFilteredNetworkMapping({
        inputProblem: this.partitionInputProblem,
        pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
      }).pinToNetworkMap

      const packInput = this.createPackInput(pinToNetworkMap)
      this.activeSubSolver = new PackSolver2(packInput)
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

  private createPackInput(pinToNetworkMap: Map<PinId, string>): PackInput {
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
          networkId,
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

      const fixedRotation = chip.availableRotations?.[0] ?? 0
      const availableRotationDegrees = chip.fixedPosition
        ? (chip.availableRotations ?? [0, 90, 180, 270])
        : getVoltageBiasedRotations(chip, this.partitionInputProblem)
      return {
        componentId: chipId,
        pads,
        availableRotationDegrees,
        ...(chip.fixedPosition && {
          isStatic: true as const,
          center: chip.fixedPosition,
          ccwRotationOffset: fixedRotation,
        }),
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

    // PackSolver2 always places a partition's single dynamic component at
    // rotation 0, ignoring availableRotationDegrees. When the partition holds a
    // single free chip, apply the voltage-biased rotation directly so power
    // pins end up on top (y+) and ground pins on the bottom (y-).
    const dynamicChipCount = Object.values(
      this.partitionInputProblem.chipMap,
    ).filter((chip) => !chip.fixedPosition).length

    for (const packedComponent of packedComponents) {
      const chipId = packedComponent.componentId

      let ccwRotationDegrees =
        packedComponent.ccwRotationDegrees ??
        packedComponent.ccwRotationOffset ??
        0

      const chip = this.partitionInputProblem.chipMap[chipId]
      if (chip && !chip.fixedPosition && dynamicChipCount === 1) {
        const preferredRotations: number[] = getVoltageBiasedRotations(
          chip,
          this.partitionInputProblem,
        )
        const preferredRotation = preferredRotations[0]
        if (
          preferredRotation !== undefined &&
          !preferredRotations.includes(ccwRotationDegrees)
        ) {
          ccwRotationDegrees = preferredRotation
        }
      }

      chipPlacements[chipId] = {
        x: packedComponent.center.x,
        y: packedComponent.center.y,
        ccwRotationDegrees,
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
