/**
 * PowerNetVerticalBiasSolver
 *
 * Post-pack phase that improves schematic readability by applying a vertical
 * bias to chip placements based on power/ground net connectivity.
 *
 * - Chips strongly connected to positive-voltage nets (VCC, VDD, V+, etc.) are
 *   shifted upward.
 * - Chips strongly connected to ground nets (GND, VSS, etc.) are shifted
 *   downward.
 * - Chips with no power/ground connections are left at their current positions.
 *
 * This mirrors common schematic conventions and reduces visual crossing of
 * power/ground traces.
 */

import { BaseSolver } from "lib/solvers/BaseSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"

export interface PowerNetVerticalBiasSolverInput {
  inputProblem: InputProblem
  layout: OutputLayout
  /** How many units to shift power-net chips upward (default: 3) */
  biasAmount?: number
}

/**
 * Compute a signed vertical bias score for a chip:
 *   > 0  → biased upward   (power net)
 *   < 0  → biased downward (ground net)
 *   = 0  → neutral
 *
 * The score is the sum of per-net biases, so a chip connected to both a power
 * net and a ground net ends up near zero (balanced).
 */
function computeChipNetBias(
  chipId: string,
  inputProblem: InputProblem,
): number {
  const chip = inputProblem.chipMap[chipId]
  if (!chip) return 0

  let bias = 0

  for (const pinId of chip.pins) {
    // Find nets connected to this pin
    for (const key of Object.keys(inputProblem.netConnMap)) {
      const [connPinId, netId] = key.split("-") as [string, string]
      if (connPinId !== pinId) continue

      const net = inputProblem.netMap[netId]
      if (!net) continue

      if (net.isPositiveVoltageSource) {
        bias += 1
      } else if (net.isGround) {
        bias -= 1
      }
    }
  }

  return bias
}

export class PowerNetVerticalBiasSolver extends BaseSolver {
  inputProblem: InputProblem
  layout: OutputLayout
  biasedLayout: OutputLayout | null = null
  biasAmount: number

  constructor(input: PowerNetVerticalBiasSolverInput) {
    super()
    this.inputProblem = input.inputProblem
    this.layout = input.layout
    this.biasAmount = input.biasAmount ?? 3
  }

  override _step() {
    const newChipPlacements = { ...this.layout.chipPlacements }

    for (const chipId of Object.keys(newChipPlacements)) {
      const original = newChipPlacements[chipId]!
      const biasScore = computeChipNetBias(chipId, this.inputProblem)

      if (biasScore === 0) {
        // No power/ground affinity — leave in place
        continue
      }

      // Positive bias → move up (negative Y in schematic coordinates where Y
      // increases downward). Negative bias → move down.
      const yDelta = -Math.sign(biasScore) * this.biasAmount

      newChipPlacements[chipId] = {
        ...original,
        y: original.y + yDelta,
      }
    }

    this.biasedLayout = {
      ...this.layout,
      chipPlacements: newChipPlacements,
    }

    this.solved = true
  }

  getOutputLayout(): OutputLayout {
    if (!this.biasedLayout) {
      throw new Error("PowerNetVerticalBiasSolver has not been solved yet.")
    }
    return this.biasedLayout
  }
}
