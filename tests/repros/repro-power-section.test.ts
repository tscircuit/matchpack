import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { getRotatedSize } from "lib/utils/rotatePinOffset"
import inputProblem from "../assets/repro-power-section.input.json"

test("power section schematic auto-layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  const c1Size = getRotatedSize(
    inputProblem.chipMap.C1!.size,
    placements.C1!.ccwRotationDegrees,
  )
  const u3Size = getRotatedSize(
    inputProblem.chipMap.U3!.size,
    placements.U3!.ccwRotationDegrees,
  )
  const horizontalGap = Math.max(
    placements.U3!.x - u3Size.x / 2 - (placements.C1!.x + c1Size.x / 2),
    placements.C1!.x - c1Size.x / 2 - (placements.U3!.x + u3Size.x / 2),
    0,
  )
  const verticalGap = Math.max(
    placements.U3!.y - u3Size.y / 2 - (placements.C1!.y + c1Size.y / 2),
    placements.C1!.y - c1Size.y / 2 - (placements.U3!.y + u3Size.y / 2),
    0,
  )
  expect(Math.hypot(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(
    inputProblem.chipGap * 2,
  )
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
