import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../assets/repro-scattered-testpoint.input.json"

test("repro scattered testpoint", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const outputLayout = solver.getOutputLayout()
  const testPointGroups = solver.alignTestPointsSolver!.testPointSideGroups
  expect(testPointGroups).toHaveLength(2)
  expect(
    testPointGroups[0]!.members.map((member) => member.testPointChipId),
  ).toEqual(["TP_LED_DATA"])
  expect(
    testPointGroups[1]!.members.map((member) => member.testPointChipId),
  ).toEqual(["TCH5", "TCH4", "TCH3", "TCH2", "TCH1"])

  const touchTestPointIds = ["TCH1", "TCH2", "TCH3", "TCH4", "TCH5"]
  expect(
    new Set(
      touchTestPointIds.map((chipId) => outputLayout.chipPlacements[chipId]!.x),
    ).size,
  ).toBe(1)
  expect(
    touchTestPointIds.every(
      (chipId) =>
        outputLayout.chipPlacements[chipId]!.ccwRotationDegrees === 180,
    ),
  ).toBe(true)
  expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
