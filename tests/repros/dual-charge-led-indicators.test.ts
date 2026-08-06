import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import {
  getRotatedSize,
  rotatePinOffset,
} from "../../lib/utils/rotatePinOffset"
import input from "../assets/dual-charge-led-indicators.input.json"

const HALF = 0.5
const COLLINEAR_TRACE_OFFSET = 0.2

test("dual charge LED indicators", async () => {
  const inputProblem = input as InputProblem
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  for (const [diodeId, resistorId, resistorMainPinId, mainPinId] of [
    ["CHG_RED", "R3", "R3.2", "IC1.7"],
    ["CHG_GREEN", "R4", "R4.2", "IC1.6"],
  ] as const) {
    const diodePlacement = placements[diodeId]!
    const resistorPlacement = placements[resistorId]!
    const diodeSize = getRotatedSize(
      inputProblem.chipMap[diodeId]!.size,
      diodePlacement.ccwRotationDegrees,
    )
    const resistorSize = getRotatedSize(
      inputProblem.chipMap[resistorId]!.size,
      resistorPlacement.ccwRotationDegrees,
    )
    expect(diodePlacement.x).toBeCloseTo(resistorPlacement.x)
    const verticalBodyGap =
      diodePlacement.y -
      resistorPlacement.y -
      diodeSize.y * HALF -
      resistorSize.y * HALF
    expect(verticalBodyGap).toBeCloseTo(inputProblem.chipGap)
    const resistorMainPinOffset = rotatePinOffset(
      inputProblem.chipPinMap[resistorMainPinId]!.offset,
      resistorPlacement.ccwRotationDegrees,
    )
    expect(resistorPlacement.y + resistorMainPinOffset.y).toBeCloseTo(
      inputProblem.chipPinMap[mainPinId]!.offset.y + COLLINEAR_TRACE_OFFSET,
    )
    expect(placements[diodeId]!.y).toBeGreaterThan(placements[resistorId]!.y)
  }

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
