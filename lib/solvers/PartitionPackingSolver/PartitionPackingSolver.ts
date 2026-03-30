import { PackSolver2 } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import { IdentifyDecouplingCapsSolver } from "../IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import type { InputProblem } from "../../types/InputProblem"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

export type PartitionPackingSolverInput = {
  inputProblem: InputProblem
  packedPartitions: PackedPartition[]
}

export class PartitionPackingSolver extends BaseSolver {
  packedPartitions: PackedPartition[]
  inputProblem: InputProblem
  finalLayout: any = null

  constructor(input: PartitionPackingSolverInput) {
    super()
    this.packedPartitions = input.packedPartitions
    this.inputProblem = input.inputProblem
  }

  override _step() {
    // If we have no parts, we are done immediately
    if (!this.packedPartitions || this.packedPartitions.length === 0) {
      this.finalLayout = { chipPlacements: {}, groupPlacements: {} }
      this.solved = true
      return
    }

    // 1. Identify which groups are decoupling capacitors
    const solver = new IdentifyDecouplingCapsSolver(this.inputProblem)
    const decouplingGroups = (solver.solve() as any) || []

    // 2. Create the layout input
    const groupsToPack = this.packedPartitions.map((p, i) => {
      const chipIds = Object.keys(p.layout.chipPlacements)
      const isDecap = decouplingGroups.some((g: any) =>
        g.decouplingCapChipIds.every((id: string) => chipIds.includes(id)),
      )

      return {
        id: `g${i}`,
        width: 100, // Placeholder size
        height: 100,
        // THIS IS THE BOUNTY GOAL: Line them up horizontally
        layout_type: isDecap ? "horizontal_row" : undefined,
      }
    })

    // 3. Run the packing and finish
    const packSolver = new PackSolver2({ groups: groupsToPack } as any)
    packSolver.solve()

    this.finalLayout = (packSolver as any).finalLayout || {
      chipPlacements: {},
      groupPlacements: {},
    }

    this.solved = true // This tells the "Renderer" to stop waiting!
  }
}
