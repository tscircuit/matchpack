import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import { rotatePinOffset } from "../../lib/utils/rotatePinOffset"
import input from "../assets/repro-dual-rail-connected-loads.input.json"

// Captured from @tscircuit/core 0.0.1331 with @tscircuit/matchpack 0.0.55.
test("dual rail-connected diode and RC loads from Core", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const groundedPairs = [
    ["R1", "D1"],
    ["C1", "R2"],
  ] as const
  expect(solver.chipPartitions).toHaveLength(1)
  for (const [nearChipId, farChipId] of groundedPairs) {
    const near = layout.chipPlacements[nearChipId!]!
    const far = layout.chipPlacements[farChipId!]!
    expect(near.ccwRotationDegrees).toBe(270)
    expect(far.ccwRotationDegrees).toBe(270)
    expect(near.x).toBe(far.x)
    expect(near.y).toBeGreaterThan(far.y)
  }
  for (const [mainPinId, pairPinId, pairChipId] of [
    ["U1.1", "R1.1", "R1"],
    ["U1.8", "C1.1", "C1"],
  ] as const) {
    const mainPlacement = layout.chipPlacements.U1!
    const pairPlacement = layout.chipPlacements[pairChipId]!
    const mainPinY =
      mainPlacement.y +
      rotatePinOffset(
        input.chipPinMap[mainPinId]!.offset,
        mainPlacement.ccwRotationDegrees,
      ).y
    const pairPinY =
      pairPlacement.y +
      rotatePinOffset(
        input.chipPinMap[pairPinId]!.offset,
        pairPlacement.ccwRotationDegrees,
      ).y
    expect(mainPinY - pairPinY).toBeCloseTo(0.2)
  }
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
