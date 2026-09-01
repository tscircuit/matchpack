import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { alignChipConnectedSameNodePairs } from "./alignChipConnectedSameNodePairs"
import {
  getChipConnectedSameNodePairs,
  type ChipConnectedSameNodePair,
} from "./getChipConnectedSameNodePairs"

export class AlignChipConnectedSameNodePairsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null
  pairs: ChipConnectedSameNodePair[] = []

  constructor(
    private params: {
      inputProblem: InputProblem
      inputLayout: OutputLayout
    },
  ) {
    super()
  }

  override _step() {
    this.pairs = getChipConnectedSameNodePairs(this.params.inputProblem)
    this.outputLayout = alignChipConnectedSameNodePairs({
      pairs: this.pairs,
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
