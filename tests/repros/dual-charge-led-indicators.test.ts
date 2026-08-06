import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/dual-charge-led-indicators.input.json"

test("dual charge LED indicators", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("ParallelSeriesBranchSolver")

  const layout = solver.getOutputLayout()
  const placements = layout.chipPlacements
  expect(placements.R3!.x).toBeCloseTo(placements.R4!.x)
  expect(placements.CHG_RED!.x).toBeCloseTo(placements.CHG_GREEN!.x)
  expect(placements.R3!.y).toBeGreaterThan(placements.R4!.y)
  expect(placements.CHG_RED!.y).toBeGreaterThan(placements.CHG_GREEN!.y)
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
