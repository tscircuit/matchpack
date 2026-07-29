import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-decoupling-caps-led-known-collision.input.json"

// Repro for decoupling caps and power-good LED collision issue.
//
// The InputProblem fixture is captured from the @tscircuit/core debug output
// of the repro144-decoupling-caps-led-known-collision test.
test("repro144 decoupling caps led known collision layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
