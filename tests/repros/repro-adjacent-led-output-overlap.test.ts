import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-adjacent-led-output-overlap.input.json"

// Captured from the exact TrafficLightController TSX in @tscircuit/core.
// Matchpack reports a solved layout even though neighboring resistor/LED output
// branches physically overlap according to its own input bounds.
test("adjacent LED output branches overlap after layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const overlaps = solver.checkForOverlaps(solver.getOutputLayout())
  expect(overlaps).toHaveLength(3)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
