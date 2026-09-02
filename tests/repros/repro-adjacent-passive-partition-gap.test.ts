import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import { getRotatedSize } from "../../lib/utils/rotatePinOffset"
import input from "../assets/repro-adjacent-passive-partition-gap.input.json"

// Captured from the exact LedBlinker TSX with @tscircuit/core 0.0.1803 and
// @tscircuit/matchpack 0.0.88. The generated layout places C1's standalone
// partition too close to the partition containing C3, causing their schematic
// annotations to overlap downstream.
test("row alignment preserves the gap between adjacent passive partitions", async () => {
  const inputProblem = input as InputProblem
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const placements = solver.getOutputLayout().chipPlacements
  const c1Placement = placements.C1!
  const c3Placement = placements.C3!
  const c1Size = getRotatedSize(
    inputProblem.chipMap.C1!.size,
    c1Placement.ccwRotationDegrees,
  )
  const c3Size = getRotatedSize(
    inputProblem.chipMap.C3!.size,
    c3Placement.ccwRotationDegrees,
  )
  const horizontalGap =
    Math.abs(c1Placement.x - c3Placement.x) - (c1Size.x + c3Size.x) / 2
  const verticalGap =
    Math.abs(c1Placement.y - c3Placement.y) - (c1Size.y + c3Size.y) / 2

  expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(
    inputProblem.partitionGap,
  )

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
