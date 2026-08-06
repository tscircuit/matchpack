import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { findSeriesFedLoadChains } from "./findSeriesFedLoadChains"
import { placeSeriesFedLoadChains } from "./placeSeriesFedLoadChains"

export class PlaceSeriesFedLoadChainsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(
    private options: {
      inputProblem: InputProblem
      inputLayout: OutputLayout
    },
  ) {
    super()
  }

  override _step() {
    const chains = findSeriesFedLoadChains(this.options.inputProblem)
    this.outputLayout = placeSeriesFedLoadChains({
      inputProblem: this.options.inputProblem,
      inputLayout: this.options.inputLayout,
      chains,
    })
    this.solved = true
  }

  override visualize(): GraphicsObject {
    let layout = this.options.inputLayout
    if (this.outputLayout) layout = this.outputLayout
    return visualizeInputProblem(this.options.inputProblem, layout)
  }

  override getConstructorParams() {
    return [this.options]
  }
}
