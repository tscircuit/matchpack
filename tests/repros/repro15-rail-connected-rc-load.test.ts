import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-rail-connected-rc-load.input.json"

// Captured from @tscircuit/core 0.0.1331 with @tscircuit/matchpack 0.0.55.
test("rail-connected resistor and capacitor load from Core", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
