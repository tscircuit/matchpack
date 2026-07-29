import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { getGroundedLoadPairs } from "./getGroundedLoadPairs"
import { layoutGroundedLoadPair } from "./layoutGroundedLoadPair"

export class GroundedLoadPairSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(
    private params: {
      inputProblem: InputProblem
      inputLayout: OutputLayout
    },
  ) {
    super()
  }

  override _step() {
    // Work on a copy so the incoming layout remains unchanged.
    const chipPlacements: Record<string, Placement> = {}
    for (const [chipId, placement] of Object.entries(
      this.params.inputLayout.chipPlacements,
    )) {
      chipPlacements[chipId] = { ...placement }
    }

    const groundedLoadPairs = getGroundedLoadPairs(this.params.inputProblem)
    // Each detected chain is placed once in deterministic discovery order.
    for (const groundedLoadPair of groundedLoadPairs) {
      layoutGroundedLoadPair({
        groundedLoadPair,
        chipPlacements,
        inputProblem: this.params.inputProblem,
      })
    }

    this.outputLayout = {
      chipPlacements,
      groupPlacements: { ...this.params.inputLayout.groupPlacements },
    }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    let outputLayout = this.params.inputLayout
    if (this.outputLayout) outputLayout = this.outputLayout
    return visualizeInputProblem(this.params.inputProblem, outputLayout)
  }

  override getConstructorParams() {
    return [this.params]
  }
}
