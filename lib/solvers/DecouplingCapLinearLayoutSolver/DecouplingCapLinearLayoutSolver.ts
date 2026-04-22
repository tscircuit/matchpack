import { BaseSolver } from "../BaseSolver"
import type { InputProblem, ChipId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"

export class DecouplingCapLinearLayoutSolver extends BaseSolver {
  inputProblem: InputProblem
  layout: OutputLayout | null = null

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
  }

  override _step() {
    // Assumption: Decoupling capacitors are arranged in a single horizontal row centered at (0,0).
    const chipIds = Object.keys(this.inputProblem.chipMap)
    const chipPlacements: Record<ChipId, Placement> = {}
    
    const gap = this.inputProblem.decouplingCapsGap ?? this.inputProblem.chipGap ?? 0.1
    
    const chips = chipIds.map(id => ({
      id,
      size: this.inputProblem.chipMap[id].size
    }))

    // Arrange horizontally in a single row
    let xOffset = 0
    for (let i = 0; i < chips.length; i++) {
      const chip = chips[i]
      if (i > 0) {
        xOffset += gap + (chips[i-1].size.x / 2) + (chip.size.x / 2)
      }
      chipPlacements[chip.id] = {
        x: xOffset,
        y: 0,
        ccwRotationDegrees: 0
      }
    }
    
    // Center them around 0
    const totalWidth = xOffset
    for (const chipId of chipIds) {
      chipPlacements[chipId].x -= totalWidth / 2
    }

    this.layout = {
      chipPlacements,
      groupPlacements: {}
    }
    this.solved = true
  }
}
