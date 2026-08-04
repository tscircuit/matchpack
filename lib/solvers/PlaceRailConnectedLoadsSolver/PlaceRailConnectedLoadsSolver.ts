import type { GraphicsObject } from "graphics-debug"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import {
  placeRailConnectedLoads,
  type PlaceRailConnectedLoadsOptions,
} from "./placeRailConnectedLoads"

export class PlaceRailConnectedLoadsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(private options: PlaceRailConnectedLoadsOptions) {
    super()
  }

  override _step() {
    this.outputLayout = placeRailConnectedLoads(this.options)
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.options.inputProblem,
      this.outputLayout ?? this.options.inputLayout,
    )
  }

  override getConstructorParams(): [PlaceRailConnectedLoadsOptions] {
    return [this.options]
  }
}
