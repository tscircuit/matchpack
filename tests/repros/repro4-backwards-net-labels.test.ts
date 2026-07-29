import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-backwards-net-labels.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// the repro54-backwards-net-labels test (U1 + R1 pull-up + C1 filter, both
// passives connecting to U1's left side, far pins on VCC/GND rails).
test("repro54 backwards net labels layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
