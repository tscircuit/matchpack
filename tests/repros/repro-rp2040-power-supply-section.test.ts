import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-rp2040-power-supply-section.input.json"

// Captured from @tscircuit/core 0.0.1539 with @tscircuit/matchpack 0.0.55.
test("RP2040 power supply section auto-layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
