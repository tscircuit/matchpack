import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro002.json"

test("repro002", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const testPointIds = ["TP5", "TP6", "TP7", "TP8", "TP9"]
  const outputLayout = solver.getOutputLayout()
  expect(solver.alignTestPointsSolver?.unconnectedTestPointAlignment).toEqual({
    orientation: "horizontal",
    chipIds: testPointIds,
    perpendicularOffset: 0,
  })
  expect(
    new Set(
      testPointIds.map((chipId) => outputLayout.chipPlacements[chipId]!.y),
    ).size,
  ).toBe(1)
  expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
