import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import inputProblem from "../assets/repro-bq24074-led-chain.input.json"

// Captured from @tscircuit/core 0.0.1549's
// "matchpack-input-problem-unnamed_board1" debug output for a simplified
// BQ24074 status-LED circuit. U1's two top pins connect to a four-part chain:
// U1.7-D1-R4-R5-D2-U1.9.
test("repro bq24074 status LED chain layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 600,
    svgHeight: 600,
  })
})
