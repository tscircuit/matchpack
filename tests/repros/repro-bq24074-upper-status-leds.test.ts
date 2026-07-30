import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import inputProblem from "../assets/repro-bq24074-upper-status-leds.input.json"

// Auto-layout subset of the BQ24074 circuit's upper status-LED section.
// The explicit schX/schY/schRotation props were omitted so matchpack can place
// U1, R4, D1, R5 and D2, while the full circuit's OUT, N_PGOOD_LED and
// N_CHG_LED net topology is preserved. Captured from @tscircuit/core 0.0.1549's
// "matchpack-input-problem-charger_upper" debug output.
test("repro bq24074 upper status LEDs", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 600,
    svgHeight: 600,
  })
})
