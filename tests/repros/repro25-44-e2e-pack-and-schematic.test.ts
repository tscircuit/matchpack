import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro44-e2e-pack-and-schematic.input.json"

// Captured from @tscircuit/core 0.0.1498 with @tscircuit/matchpack 0.0.59.
test("Core repro44 schematic auto-layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
