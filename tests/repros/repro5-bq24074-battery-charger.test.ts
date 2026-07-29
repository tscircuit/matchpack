import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-bq24074-battery-charger.input.json"

// Repro for the BQ24074 Li-ion charger reference board.
//
// The InputProblem fixture is the *enriched* matchpack input that @tscircuit/core
// feeds to the LayoutPipelineSolver (captured from the
// "matchpack-input-problem-*" debug output, i.e. with core's power/ground
// rotation constraints, per-chip availableRotations and chip/partition gaps).
// Running the solver on it reproduces the exact placement core produces, which
// downstream (schematic-trace-solver) cannot net-label without overlaps because
// neighbouring components are packed tighter than the net labels need — e.g. D2's
// anode label can only extend left, over D1's cathode pin/trace.
test("repro bq24074 battery charger layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
