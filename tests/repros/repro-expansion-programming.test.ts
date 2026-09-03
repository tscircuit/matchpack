import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-expansion-programming.input.json"

test("expansion and programming schematic section", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  expect(placements.J4!.y).toBeCloseTo(placements.J5!.y)
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
