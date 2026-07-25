import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../assets/repro-scattered-testpoint.input.json"

test("repro scattered testpoint", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const outputLayout = solver.getOutputLayout()
  const testPointIds = ["TP_LED_DATA", "TCH1", "TCH2", "TCH3", "TCH4", "TCH5"]
  const touchTestPointXPositions = testPointIds
    .slice(1)
    .map((chipId) => outputLayout.chipPlacements[chipId]!.x)

  const testPointGroups = solver.alignTestPointsSolver!.testPointSideGroups
  expect(testPointGroups).toHaveLength(2)
  expect(testPointGroups.map((group) => group.members.length).sort()).toEqual([
    1, 5,
  ])
  expect(
    testPointGroups.find((group) => group.members.length === 5)?.tangentOffset,
  ).toBeLessThan(0)
  expect(
    testPointGroups.find((group) => group.members.length === 1)?.tangentOffset,
  ).toBe(0)
  expect(new Set(touchTestPointXPositions).size).toBe(1)
  expect(outputLayout.chipPlacements.TP_LED_DATA!.x).not.toBe(
    touchTestPointXPositions[0],
  )
  expect(
    testPointIds.every(
      (chipId) =>
        outputLayout.chipPlacements[chipId]!.ccwRotationDegrees === 180,
    ),
  ).toBe(true)
  expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
