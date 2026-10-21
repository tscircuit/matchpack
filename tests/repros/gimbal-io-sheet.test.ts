import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/gimbal-io-sheet.input.json"

// Captured from Gimbal One's sheet_IO with core 588d3bc858c1 (0.0.2182)
// and matchpack 3aa290dbbff5 (0.0.100), preserving Core's complete packing input.
test("Gimbal One sheet_IO schematic layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
