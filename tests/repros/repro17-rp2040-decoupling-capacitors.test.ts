import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-rp2040-decoupling-capacitors.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// the repro50-rp2040-decoupling-capacitors test (RP2040 U3 + 11 decoupling caps).
// This is the same sub-circuit as rp2040-zero's group5. The packer places the
// caps into clean rail rows here; the goal is to NOT disturb that.
test("repro50 rp2040 decoupling capacitors layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
