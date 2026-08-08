import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import { getRotatedSize } from "../../lib/utils/rotatePinOffset"
import input from "../assets/rp2040-swd-status-led-layout.input.json"

test("RP2040 SWD and status LED layout", async () => {
  const inputProblem = input as InputProblem
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  const outputLayout = solver.getOutputLayout()
  const testPointOverlaps = solver
    .checkForOverlaps(outputLayout)
    .filter(
      ({ chip1, chip2 }) =>
        inputProblem.chipMap[chip1]?.isTestPoint &&
        inputProblem.chipMap[chip2]?.isTestPoint,
    )
  expect(testPointOverlaps).toEqual([])

  const swdioPlacement = outputLayout.chipPlacements.TP_SWDIO!
  const v3v3Placement = outputLayout.chipPlacements.TP_3V3!
  const swdioSize = getRotatedSize(
    input.chipMap.TP_SWDIO.size,
    swdioPlacement.ccwRotationDegrees,
  )
  const v3v3Size = getRotatedSize(
    input.chipMap.TP_3V3.size,
    v3v3Placement.ccwRotationDegrees,
  )
  const swdioToV3v3Gap =
    Math.abs(swdioPlacement.x - v3v3Placement.x) -
    (swdioSize.x + v3v3Size.x) / 2
  expect(swdioToV3v3Gap).toBeCloseTo(inputProblem.chipGap)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
