import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { alignGroundedLoadPairs } from "./alignGroundedLoadPairs"
import type { GroundedLoadPair } from "../GroundedLoadPairSolver/getGroundedLoadPairs"

export class AlignGroundedLoadPairsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(
    private params: {
      inputProblem: InputProblem
      inputLayout: OutputLayout
      groundedLoadPairs: GroundedLoadPair[]
    },
  ) {
    super()
  }

  override _step() {
    this.outputLayout = alignGroundedLoadPairs({
      groundedLoadPairs: this.params.groundedLoadPairs,
      inputProblem: this.params.inputProblem,
      inputLayout: this.params.inputLayout,
    })
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
