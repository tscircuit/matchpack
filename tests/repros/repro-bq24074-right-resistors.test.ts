import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-bq24074-right-resistors.input.json"

// Simplified BQ24074 repro, right-side variant: U1 plus three resistors
// (R1/R2/R3) whose pin1 connects via direct two-pin traces to U1's EN2/EN1/TMR
// pins — all on U1's right (x+) edge — with their other pin on GND.
//
// The fixture is the *enriched* matchpack InputProblem captured from
// @tscircuit/core's "matchpack-input-problem-charger" debug output for the
// corresponding tsx (U1 is fixed at the origin via schX/schY=0). It isolates the
// same-side passive-bank case on the right edge: calculate-packing places the
// resistors one at a time and does not lay them out as a clean column beside U1.
test("repro bq24074 right resistors layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 600,
    svgHeight: 600,
  })
})
