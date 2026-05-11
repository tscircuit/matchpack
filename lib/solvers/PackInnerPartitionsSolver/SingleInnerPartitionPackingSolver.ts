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
  Chip,
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
    // Decoupling-cap partitions use a dedicated linear-row layout instead of
    // the generic packer. Caps line up horizontally with each cap rotated so
    // its positive-voltage pin faces the same direction across the row.
    if (this.partitionInputProblem.partitionType === "decoupling_caps") {
      this.layout = this.createDecouplingCapsLayout()
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

  /**
   * Lay out the decoupling capacitors in a horizontal row, centered around the
   * partition origin. Each cap is rotated (0° or 180°) so that the pin
   * connected to a positive-voltage net consistently faces the same direction
   * (y+ when possible) — that's the convention seen in hand-drawn schematics
   * and is what makes a row of decoupling caps look uniform.
   */
  private createDecouplingCapsLayout(): OutputLayout {
    const { chipMap } = this.partitionInputProblem
    const chips = Object.values(chipMap)
    const gap =
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap ??
      0.1

    // Pick a target side for the positive-voltage pin once for the partition,
    // by majority vote of the caps' natural (rotation=0) layout. This keeps
    // already-correctly-oriented caps unchanged when possible.
    const naturalSides = chips
      .map((c) => this.getPositivePinNaturalSide(c))
      .filter((s): s is "y+" | "y-" | "x+" | "x-" => s != null)
    const targetSide = this.pickTargetSide(naturalSides)

    const chipPlacements: Record<ChipId, Placement> = {}
    let currentX = 0
    for (const chip of chips) {
      const rotation = this.pickRotationForPositivePin(chip, targetSide)
      chipPlacements[chip.chipId] = {
        x: currentX + chip.size.x / 2,
        y: 0,
        ccwRotationDegrees: rotation,
      }
      currentX += chip.size.x + gap
    }

    // Center the row around x=0.
    const totalWidth = Math.max(currentX - gap, 0)
    const offsetX = -totalWidth / 2
    for (const id in chipPlacements) {
      chipPlacements[id]!.x += offsetX
    }

    return { chipPlacements, groupPlacements: {} }
  }

  /**
   * Side (y+/y-/x+/x-) of the chip where the positive-voltage pin sits at
   * rotation 0. Returns null if no pin is connected to a positive-voltage net.
   */
  private getPositivePinNaturalSide(
    chip: Chip,
  ): "y+" | "y-" | "x+" | "x-" | null {
    const { chipPinMap, netMap, netConnMap } = this.partitionInputProblem
    for (const pinId of chip.pins) {
      const pin = chipPinMap[pinId]
      if (!pin) continue
      for (const netId in netMap) {
        if (!netMap[netId]?.isPositiveVoltageSource) continue
        if (netConnMap[`${pinId}-${netId}` as `${PinId}-${NetId}`]) {
          return pin.side
        }
      }
    }
    return null
  }

  /**
   * Pick the consistent target side for positive-voltage pins. Prefers y+ when
   * supported, otherwise picks the most common natural side so we minimize the
   * number of caps that need to be flipped from their input orientation.
   */
  private pickTargetSide(
    naturalSides: Array<"y+" | "y-" | "x+" | "x-">,
  ): "y+" | "y-" | "x+" | "x-" {
    if (naturalSides.length === 0) return "y+"
    const counts: Record<string, number> = {}
    for (const s of naturalSides) counts[s] = (counts[s] ?? 0) + 1
    // Default to y+ unless another side has strictly more votes.
    let best: "y+" | "y-" | "x+" | "x-" = "y+"
    let bestCount = counts["y+"] ?? 0
    for (const s of ["y-", "x+", "x-"] as const) {
      if ((counts[s] ?? 0) > bestCount) {
        best = s
        bestCount = counts[s]!
      }
    }
    return best
  }

  /**
   * Pick a rotation (in degrees, ccw) such that the cap's positive-voltage pin
   * ends up on the target side after rotation. Falls back to the first
   * availableRotation when there's no positive-voltage pin to align.
   */
  private pickRotationForPositivePin(
    chip: Chip,
    targetSide: "y+" | "y-" | "x+" | "x-",
  ): number {
    const naturalSide = this.getPositivePinNaturalSide(chip)
    const allowed = chip.availableRotations ?? [0, 90, 180, 270]
    if (naturalSide == null) return allowed[0] ?? 0

    const rotateSide = (
      side: "y+" | "y-" | "x+" | "x-",
      deg: 0 | 90 | 180 | 270,
    ): "y+" | "y-" | "x+" | "x-" => {
      // CCW rotation of a side label.
      const order = ["x+", "y+", "x-", "y-"] as const
      const idx = order.indexOf(side)
      const steps = (deg / 90) | 0
      return order[(idx + steps) % 4]!
    }

    for (const rot of allowed) {
      if (rotateSide(naturalSide, rot) === targetSide) return rot
    }
    // Target unreachable with this cap's rotation set; keep its first allowed.
    return allowed[0] ?? 0
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
