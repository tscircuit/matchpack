import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/schematic-section-rp2040-boot-reset.input.json"

// Captured from @tscircuit/core 0.0.1498 with @tscircuit/matchpack 0.0.59.
test("RP2040 boot and reset schematic section auto-layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
