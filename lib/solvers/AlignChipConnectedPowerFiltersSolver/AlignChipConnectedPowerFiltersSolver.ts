import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { alignChipConnectedPowerFilters } from "./alignChipConnectedPowerFilters"
import {
  getChipConnectedPowerFilters,
  type ChipConnectedPowerFilter,
} from "./getChipConnectedPowerFilters"

export class AlignChipConnectedPowerFiltersSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null
  powerFilters: ChipConnectedPowerFilter[] = []

  constructor(
    private params: {
      inputProblem: InputProblem
      inputLayout: OutputLayout
    },
  ) {
    super()
  }

  override _step() {
    this.powerFilters = getChipConnectedPowerFilters(this.params.inputProblem)
    this.outputLayout = alignChipConnectedPowerFilters({
      powerFilters: this.powerFilters,
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
