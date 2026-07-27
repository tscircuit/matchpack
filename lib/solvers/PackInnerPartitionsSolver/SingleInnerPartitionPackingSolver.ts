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
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { createFilteredNetworkMapping } from "../../utils/networkFiltering"
import { getPadsBoundingBox } from "./getPadsBoundingBox"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"

const PIN_SIZE = 0.1
const DIRECT_PASSIVE_PIN_VERTICAL_OFFSET = 0.2

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
      return {
        componentId: chipId,
        pads,
        availableRotationDegrees: chip.availableRotations ?? [0, 90, 180, 270],
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

    for (const packedComponent of packedComponents) {
      const chipId = packedComponent.componentId

      chipPlacements[chipId] = {
        x: packedComponent.center.x,
        y: packedComponent.center.y,
        ccwRotationDegrees:
          packedComponent.ccwRotationDegrees ??
          packedComponent.ccwRotationOffset ??
          0,
      }
    }

    this.offsetSingleDirectPassiveBelowPin(chipPlacements)

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  /**
   * A two-chip partition with one direct passive connection is a common
   * schematic pattern (for example an LDO's BYP capacitor). PackSolver2 tends
   * to put the connected pins on one horizontal line, which makes the result
   * look like a continuation of the main chip's pin. Drop the passive's
   * connected pin slightly below that line while preserving the packed X
   * position.
   *
   * Only move a passive whose connected pin is its upper pin, and only move it
   * downward. That preserves the packer's collision clearance.
   */
  private offsetSingleDirectPassiveBelowPin(
    chipPlacements: Record<string, Placement>,
  ): void {
    const problem = this.partitionInputProblem
    const chips = Object.values(problem.chipMap)
    if (chips.length !== 2) return

    const passive = chips.find(
      (chip) =>
        chip.pins.length === 2 &&
        !chip.fixedPosition &&
        (chip.isCapacitor || chip.isResistor),
    )
    const mainChip = chips.find(
      (chip) => chip.chipId !== passive?.chipId && chip.pins.length > 2,
    )
    if (!passive || !mainChip) return

    const directPinPairs = new Map<string, [PinId, PinId]>()
    for (const [connectionKey, connected] of Object.entries(
      problem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [pinA, pinB] = connectionKey.split("-") as [PinId, PinId]
      const passivePinId = passive.pins.includes(pinA)
        ? pinA
        : passive.pins.includes(pinB)
          ? pinB
          : null
      const mainPinId = mainChip.pins.includes(pinA)
        ? pinA
        : mainChip.pins.includes(pinB)
          ? pinB
          : null
      if (!passivePinId || !mainPinId) continue
      directPinPairs.set([passivePinId, mainPinId].sort().join("|"), [
        passivePinId,
        mainPinId,
      ])
    }
    if (directPinPairs.size !== 1) return

    const [passivePinId, mainPinId] = [...directPinPairs.values()][0]!
    const passivePlacement = chipPlacements[passive.chipId]
    const mainPlacement = chipPlacements[mainChip.chipId]
    const passivePin = problem.chipPinMap[passivePinId]
    const mainPin = problem.chipPinMap[mainPinId]
    if (!passivePlacement || !mainPlacement || !passivePin || !mainPin) return

    const passivePinOffset = rotatePinOffset(
      passivePin.offset,
      passivePlacement.ccwRotationDegrees,
    )
    const otherPassivePinId = passive.pins.find(
      (pinId) => pinId !== passivePinId,
    )
    const otherPassivePin =
      otherPassivePinId && problem.chipPinMap[otherPassivePinId]
    if (!otherPassivePin) return
    const otherPassivePinOffset = rotatePinOffset(
      otherPassivePin.offset,
      passivePlacement.ccwRotationDegrees,
    )
    if (passivePinOffset.y <= otherPassivePinOffset.y) return

    const mainPinOffset = rotatePinOffset(
      mainPin.offset,
      mainPlacement.ccwRotationDegrees,
    )
    const mainPinY = mainPlacement.y + mainPinOffset.y
    const desiredPassiveY =
      mainPinY - DIRECT_PASSIVE_PIN_VERTICAL_OFFSET - passivePinOffset.y
    if (passivePlacement.y <= desiredPassiveY) return
    passivePlacement.y = desiredPassiveY
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
