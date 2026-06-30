import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-e2e-pack-and-schematic.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// the repro44-e2e-pack-and-schematic test (555-timer style circuit: U1 + R1/R2/R3
// + C1/C2 + D1). Lets us inspect/iterate on matchpack's body-level layout here.
test("repro44 e2e pack and schematic layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
