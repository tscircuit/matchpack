import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import { getRotatedSize } from "../../lib/utils/rotatePinOffset"
import input from "../assets/repro-rp2040-power-supply-section.input.json"

// Captured from @tscircuit/core 0.0.1539 with @tscircuit/matchpack 0.0.55.
test("RP2040 power supply section auto-layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  const c1Size = getRotatedSize(
    input.chipMap.C1!.size,
    placements.C1!.ccwRotationDegrees,
  )
  const u2Size = getRotatedSize(
    input.chipMap.U2!.size,
    placements.U2!.ccwRotationDegrees,
  )
  const gap =
    placements.U2!.x - u2Size.x / 2 - (placements.C1!.x + c1Size.x / 2)
  expect(gap).toBeCloseTo(input.chipGap * 2)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
