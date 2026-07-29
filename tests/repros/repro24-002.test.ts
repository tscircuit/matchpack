import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro002.json"

test("repro002", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const testPointIds = ["TP5", "TP6", "TP7", "TP8", "TP9"]
  const alignTestPointsSolver = solver.alignTestPointsSolver!
  const outputLayout = solver.getOutputLayout()
  expect(alignTestPointsSolver.testPointSideGroups).toHaveLength(0)
  expect(
    new Set(
      testPointIds.map(
        (testPointId) => outputLayout.chipPlacements[testPointId]!.y,
      ),
    ).size,
  ).toBe(1)
  expect(
    testPointIds.map(
      (testPointId) => outputLayout.chipPlacements[testPointId]!.x,
    ),
  ).toEqual(
    testPointIds.map(
      (testPointId) =>
        alignTestPointsSolver.inputLayout.chipPlacements[testPointId]!.x,
    ),
  )

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
