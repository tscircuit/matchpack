import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { offsetCollinearConnections } from "./offsetCollinearConnections"

export class OffsetSchematicTraceConnectionsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(
    private solverInput: {
      inputProblem: InputProblem
      inputLayout: OutputLayout
    },
  ) {
    super()
  }

  override _step() {
    this.outputLayout = offsetCollinearConnections(this.solverInput)
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.solverInput.inputProblem,
      this.outputLayout ?? this.solverInput.inputLayout,
    )
  }

  override getConstructorParams() {
    return [this.solverInput]
  }
}
