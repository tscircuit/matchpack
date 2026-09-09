import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { alignParallelBranches } from "./alignParallelBranches"

export class AlignParallelBranchesSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null
  constructor(
    private params: { inputProblem: InputProblem; inputLayout: OutputLayout },
  ) {
    super()
  }
  override _step() {
    this.outputLayout = alignParallelBranches(
      this.params.inputProblem,
      this.params.inputLayout,
    )
    this.solved = true
  }
  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.params.inputProblem,
      this.outputLayout ?? this.params.inputLayout,
    )
  }
  override getConstructorParams() {
    return [this.params]
  }
}
