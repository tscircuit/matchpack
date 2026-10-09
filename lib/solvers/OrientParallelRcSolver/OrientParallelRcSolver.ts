import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { orientParallelRc } from "./orientParallelRc"

export class OrientParallelRcSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(
    private params: { inputProblem: InputProblem; inputLayout: OutputLayout },
  ) {
    super()
  }

  override _step() {
    this.outputLayout = orientParallelRc(
      this.params.inputProblem,
      this.params.inputLayout,
    )
    this.solved = true
  }

  override visualize() {
    return visualizeInputProblem(
      this.params.inputProblem,
      this.outputLayout ?? this.params.inputLayout,
    )
  }

  override getConstructorParams() {
    return [this.params]
  }
}
