import type { GraphicsObject } from "graphics-debug"
import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { BaseSolver } from "../BaseSolver"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { placeWeakPartitionsNearStrongConnections } from "./placeWeakPartitionNearStrongConnection"

export class PlaceWeakPartitionNearStrongConnectionSolver extends BaseSolver {
  inputProblem: InputProblem
  packedPartitions: PackedPartition[]
  inputLayout: OutputLayout
  outputLayout: OutputLayout | null = null

  constructor(params: {
    inputProblem: InputProblem
    packedPartitions: PackedPartition[]
    inputLayout: OutputLayout
  }) {
    super()
    this.inputProblem = params.inputProblem
    this.packedPartitions = params.packedPartitions
    this.inputLayout = params.inputLayout
  }

  override _step() {
    this.outputLayout = placeWeakPartitionsNearStrongConnections({
      inputProblem: this.inputProblem,
      packedPartitions: this.packedPartitions,
      inputLayout: this.inputLayout,
    })
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.inputProblem,
      this.outputLayout ?? this.inputLayout,
    )
  }

  override getConstructorParams(): [
    {
      inputProblem: InputProblem
      packedPartitions: PackedPartition[]
      inputLayout: OutputLayout
    },
  ] {
    return [
      {
        inputProblem: this.inputProblem,
        packedPartitions: this.packedPartitions,
        inputLayout: this.inputLayout,
      },
    ]
  }
}
