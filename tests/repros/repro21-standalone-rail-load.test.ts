import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-standalone-rail-load.input.json"

test("standalone two-component rail load is stacked vertically", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  expect(placements.D2!.ccwRotationDegrees).toBe(270)
  expect(placements.R1!.ccwRotationDegrees).toBe(270)
  expect(placements.D2!.x).toBeCloseTo(placements.R1!.x)
  expect(placements.D2!.y).toBeGreaterThan(placements.R1!.y)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
