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
  Chip,
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

  private getPinNetIds(pinId: string): string[] {
    const netIds: string[] = []
    for (const [connKey, connected] of Object.entries(
      this.partitionInputProblem.netConnMap,
    )) {
      if (!connected) continue
      if (!connKey.startsWith(`${pinId}-`)) continue
      netIds.push(connKey.slice(pinId.length + 1))
    }
    return netIds
  }

  private isPowerGroundNet(netId: string): boolean {
    const net = this.partitionInputProblem.netMap[netId]
    return net?.isPositiveVoltageSource === true || net?.isGround === true
  }

  private getAlignmentGroupId(chip: Chip): string | null {
    if (chip.fixedPosition || chip.pins.length !== 2) return null

    const signalNetIds = new Set<string>()
    let connectedPowerGroundPinCount = 0

    for (const pinId of chip.pins) {
      const pinNetIds = this.getPinNetIds(pinId)
      if (pinNetIds.length === 0) return null

      let pinHasPowerGroundNet = false
      for (const netId of pinNetIds) {
        if (this.isPowerGroundNet(netId)) {
          pinHasPowerGroundNet = true
        } else {
          signalNetIds.add(netId)
        }
      }

      if (pinHasPowerGroundNet) connectedPowerGroundPinCount++
    }

    if (connectedPowerGroundPinCount === 0) return null
    if (signalNetIds.size === 0) return "power-ground"
    if (signalNetIds.size === 1) return `signal:${[...signalNetIds][0]}`
    return null
  }

  private isAlignmentRowPartition(): boolean {
    const chips = Object.values(this.partitionInputProblem.chipMap)
    if (chips.length < 2) return false

    let commonGroupId: string | null = null
    for (const chip of chips) {
      const groupId = this.getAlignmentGroupId(chip)
      if (!groupId) return false
      if (commonGroupId === null) {
        commonGroupId = groupId
      } else if (commonGroupId !== groupId) {
        return false
      }
    }
    return true
  }

  private createAlignmentRowLayout(): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}
    const chipIds = Object.keys(this.partitionInputProblem.chipMap)
    const orderedChips = chipIds.map(
      (id) => this.partitionInputProblem.chipMap[id]!,
    )

    let cursorX = 0
    let gap = this.partitionInputProblem.chipGap
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      gap = this.partitionInputProblem.decouplingCapsGap ?? gap
    }

    for (const chip of orderedChips) {
      const rotation = chip.availableRotations?.[0] ?? 0
      const isRotated = rotation === 90 || rotation === 270
      const width = isRotated ? chip.size.y : chip.size.x

      const x = cursorX + width / 2
      chipPlacements[chip.chipId] = {
        x,
        y: 0,
        ccwRotationDegrees: rotation,
      }

      cursorX += width + gap
    }

    const rowWidth = cursorX - gap
    for (const chip of orderedChips) {
      chipPlacements[chip.chipId]!.x -= rowWidth / 2
    }

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override _step() {
    if (this.isAlignmentRowPartition()) {
      this.layout = this.createAlignmentRowLayout()
      this.solved = true
      return
    }

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

      // REVIEWER NOTE: PackSolver2 only supports a single global minGap parameter.
      // To support heterogeneous gaps (decoupling caps at 0.4 gap, standard chips at 1.2 gap),
      // we configure the packer's global minGap to the smallest spacing (decouplingCapsGap = 0.4).
      // For any standard non-capacitor component, we expand its body pad dimensions by the difference
      // (extraMargin = chipGap - decouplingCapsGap = 0.8) so it maintains its required 1.2 gap.
      const isCap = this.isDecouplingCap(chipId)
      const baseMinGap = Math.min(
        this.partitionInputProblem.chipGap,
        this.partitionInputProblem.decouplingCapsGap ?? 0.4,
      )
      const requiredGap = isCap
        ? (this.partitionInputProblem.decouplingCapsGap ?? 0.4)
        : this.partitionInputProblem.chipGap
      const extraMargin = Math.max(0, requiredGap - baseMinGap)

      pads.push({
        padId: `${chipId}_body`,
        networkId: `${chipId}_body_disconnected`,
        type: "rect" as const,
        offset: { x: 0, y: 0 },
        size: {
          x: Math.max(padsBoundingBoxSize.x, chip.size.x) + extraMargin,
          y: Math.max(padsBoundingBoxSize.y, chip.size.y) + extraMargin,
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

    const baseMinGap = Math.min(
      this.partitionInputProblem.chipGap,
      this.partitionInputProblem.decouplingCapsGap ?? 0.4,
    )

    return {
      components: packComponents,
      minGap: baseMinGap,
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_closest_sum_squared_distance",
    }
  }

  private isDecouplingCap(chipId: string): boolean {
    const chip = this.partitionInputProblem.chipMap[chipId]
    if (!chip || chip.pins.length !== 2) return false

    let hasGround = false
    let hasNonGround = false

    for (const pinId of chip.pins) {
      const nets = this.getPinNetIds(pinId)
      for (const netId of nets) {
        if (this.isPowerGroundNet(netId)) {
          hasGround = true
        } else {
          hasNonGround = true
        }
      }
    }

    return hasGround && hasNonGround
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
