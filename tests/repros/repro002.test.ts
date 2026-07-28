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
  for (const testPointId of testPointIds) {
    expect(outputLayout.chipPlacements[testPointId]).toEqual(
      alignTestPointsSolver.inputLayout.chipPlacements[testPointId],
    )
  }

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
