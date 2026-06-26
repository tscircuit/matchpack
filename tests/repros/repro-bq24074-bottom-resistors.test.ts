import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-bq24074-bottom-resistors.input.json"

// Simplified BQ24074 repro: U1 plus the three programming/sense resistors
// (R1/R2/R3) that connect to U1's bottom-edge pins (ITERM/ILIM/ISET) via direct
// two-pin traces, with their other pin on GND.
//
// The fixture is the *enriched* matchpack InputProblem captured from
// @tscircuit/core's "matchpack-input-problem-charger" debug output for the
// corresponding tsx, so it carries core's real schematic geometry and per-chip
// rotation constraints. It isolates the bottom "resistor bank" case: with
// nothing but strong pin-to-pin links to drive it, calculate-packing places the
// resistors one at a time and does not lay them out as a clean row under U1.
test("repro bq24074 bottom resistors layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 600,
    svgHeight: 600,
  })
})
