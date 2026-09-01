import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { alignChipConnectedPullUpRcNetworks } from "./alignChipConnectedPullUpRcNetworks"
import {
  type ChipConnectedPullUpRcNetwork,
  getChipConnectedPullUpRcNetworks,
} from "./getChipConnectedPullUpRcNetworks"

export class AlignChipConnectedPullUpRcNetworksSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null
  pullUpRcNetworks: ChipConnectedPullUpRcNetwork[] = []

  constructor(
    private params: {
      inputProblem: InputProblem
      inputLayout: OutputLayout
    },
  ) {
    super()
  }

  override _step() {
    this.pullUpRcNetworks = getChipConnectedPullUpRcNetworks(
      this.params.inputProblem,
    )
    this.outputLayout = alignChipConnectedPullUpRcNetworks({
      pullUpRcNetworks: this.pullUpRcNetworks,
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
