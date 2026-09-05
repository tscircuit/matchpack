import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-adjacent-led-output-overlap.input.json"

// Captured from the exact TrafficLightController TSX in @tscircuit/core.
// Adjacent resistor/LED output branches must remain collision-free after the
// grounded-load placement pass.
test("adjacent LED output branches remain collision-free", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const overlaps = solver.checkForOverlaps(solver.getOutputLayout())
  expect(overlaps).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
