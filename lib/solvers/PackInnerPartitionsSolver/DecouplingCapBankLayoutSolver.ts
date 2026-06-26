/**
 * Lays out a decoupling-capacitor partition as a uniform bank:
 *
 * - All caps oriented with their VCC/positive pin facing y+ (top) and their
 *   GND/negative pin facing y- (bottom), matching datasheet convention.
 * - Caps are placed side-by-side with uniform pitch (cap width + gap).
 * - When there are more than `maxPerRow` caps the bank wraps into multiple
 *   balanced rows, keeping the VCC rail continuous.
 *
 * This is a synchronous, single-step solver because the placement is fully
 * deterministic — no search needed.
 */

import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { PartitionInputProblem, ChipId } from "../../types/InputProblem"

const MAX_PER_ROW = 8

export class DecouplingCapBankLayoutSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null

  constructor(partitionInputProblem: PartitionInputProblem) {
    super()
    this.partitionInputProblem = partitionInputProblem
  }

  override _step() {
    const { chipMap, chipPinMap, netMap, netConnMap } =
      this.partitionInputProblem
    const gap = this.partitionInputProblem.decouplingCapsGap ?? 0.1

    const chips = Object.values(chipMap)
    if (chips.length === 0) {
      this.layout = { chipPlacements: {}, groupPlacements: {} }
      this.solved = true
      return
    }

    // Sort caps deterministically
    const sortedChips = [...chips].sort((a, b) =>
      a.chipId.localeCompare(b.chipId, undefined, { numeric: true }),
    )

    // Figure out which pin of each cap is the VCC pin (isPositiveVoltageSource)
    // and whether the cap needs to be flipped (rotated 180°)
    const capRotations = new Map<ChipId, 0 | 180>()

    for (const chip of sortedChips) {
      const [pin1Id, pin2Id] = chip.pins
      if (!pin1Id || !pin2Id) {
        capRotations.set(chip.chipId, 0)
        continue
      }

      // Find which net each pin connects to
      const getNet = (pinId: string) => {
        for (const key of Object.keys(netConnMap)) {
          const [p, n] = key.split("-") as [string, string]
          if (p === pinId) return netMap[n]
        }
        return undefined
      }

      const net1 = getNet(pin1Id)
      const net2 = getNet(pin2Id)

      // pin1 is typically "top" in default (0°) rotation.
      // If pin1 is GND and pin2 is VCC, we need to flip (180°).
      const pin1IsGnd = net1?.isGround ?? false
      const pin2IsGnd = net2?.isGround ?? false

      // Flip if pin1 is GND (meaning VCC is at bottom in default orientation)
      capRotations.set(chip.chipId, pin1IsGnd && !pin2IsGnd ? 180 : 0)
    }

    // Use the first chip's dimensions as the uniform cap size
    const refChip = sortedChips[0]!
    const capW = refChip.size.x
    const capH = refChip.size.y

    const pitch = capW + gap
    const perRow = Math.min(MAX_PER_ROW, sortedChips.length)
    const rowCount = Math.ceil(sortedChips.length / perRow)
    const rowPitch = capH + gap

    const chipPlacements: Record<ChipId, Placement> = {}

    for (let i = 0; i < sortedChips.length; i++) {
      const chip = sortedChips[i]!
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const x = col * pitch
      const y = -row * rowPitch
      chipPlacements[chip.chipId] = {
        x,
        y,
        ccwRotationDegrees: capRotations.get(chip.chipId) ?? 0,
      }
    }

    this.layout = { chipPlacements, groupPlacements: {} }
    this.solved = true
  }

  override getConstructorParams(): ConstructorParameters<
    typeof DecouplingCapBankLayoutSolver
  > {
    return [this.partitionInputProblem]
  }
}
