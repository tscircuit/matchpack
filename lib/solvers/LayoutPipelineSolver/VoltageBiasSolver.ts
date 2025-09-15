import { BaseSolver } from "../BaseSolver"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"

/**
 * VoltageBiasSolver moves chips with VCC/V* connections upward in the layout.
 */
export class VoltageBiasSolver extends BaseSolver {
  inputProblem: InputProblem
  outputLayout: OutputLayout | null = null
  override solved = false

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
  }

  override _step() {
    const chipMap = this.inputProblem.chipMap
    const netMap = this.inputProblem.netMap
    const chipPlacements: Record<
      string,
      { x: number; y: number; ccwRotationDegrees: number }
    > = {}

    // Gather all netIds that are positive voltage sources
    const positiveVoltageNetIds = Object.keys(netMap).filter(
      (netId) => netMap[netId]?.isPositiveVoltageSource,
    )

    let yBase = 0
    let yStep = 2
    for (const chipId in chipMap) {
      const chip = chipMap[chipId]
      let hasVccPin = false
      for (const pinId of chip?.pins ?? []) {
        for (const netId of positiveVoltageNetIds) {
          const net = netMap[netId]
          // Check if this pin is part of the net's groupPins
          if (Array.isArray((net as any).groupPins)) {
            if ((net as any).groupPins.some((gp: any) => gp.pinId === pinId)) {
              hasVccPin = true
              break
            }
          }
        }
        if (hasVccPin) break
      }
      chipPlacements[chipId] = {
        x: 0,
        y: hasVccPin ? yBase + yStep : yBase,
        ccwRotationDegrees: 0,
      }
      yBase += yStep
    }

    this.outputLayout = {
      chipPlacements,
      groupPlacements: {},
    }
    this.solved = true
  }

  getOutputLayout(): OutputLayout | null {
    return this.outputLayout
  }
}
