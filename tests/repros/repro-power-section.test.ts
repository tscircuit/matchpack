import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import inputProblem from "../assets/repro-power-section.input.json"

test("power section schematic auto-layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  expect(placements.C1!.x).toBeLessThan(placements.U3!.x)
  expect(placements.C1!.y).toBeCloseTo(placements.U3!.y)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
