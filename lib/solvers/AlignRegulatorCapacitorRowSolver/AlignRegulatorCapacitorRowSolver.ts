import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { alignRegulatorCapacitorRows } from "./alignRegulatorCapacitorRows"

export class AlignRegulatorCapacitorRowSolver extends BaseSolver {
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
    this.outputLayout = alignRegulatorCapacitorRows(
      this.params.inputProblem,
      this.params.inputLayout,
    )
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
