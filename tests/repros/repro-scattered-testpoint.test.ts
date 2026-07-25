import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../assets/repro-scattered-testpoint.input.json"

test("repro scattered testpoint", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const outputLayout = solver.getOutputLayout()
  const testPointIds = ["TP_LED_DATA", "TCH1", "TCH2", "TCH3", "TCH4", "TCH5"]
  const testPointXPositions = testPointIds.map(
    (chipId) => outputLayout.chipPlacements[chipId]!.x,
  )

  expect(solver.alignTestPointsSolver?.testPointSideGroups).toHaveLength(1)
  expect(
    solver.alignTestPointsSolver?.testPointSideGroups[0]?.tangentOffset,
  ).toBeLessThan(0)
  expect(new Set(testPointXPositions).size).toBe(1)
  expect(
    testPointIds.every(
      (chipId) =>
        outputLayout.chipPlacements[chipId]!.ccwRotationDegrees === 180,
    ),
  ).toBe(true)
  expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
