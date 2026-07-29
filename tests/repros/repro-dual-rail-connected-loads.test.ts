import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-dual-rail-connected-loads.input.json"

// Captured from @tscircuit/core 0.0.1331 with @tscircuit/matchpack 0.0.55.
test("dual rail-connected diode and RC loads from Core", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const groundedPairs = solver
    .chipPartitions!.filter(
      (partition) => partition.partitionType === "grounded_load_pair",
    )
    .map((partition) => Object.keys(partition.chipMap))

  expect(groundedPairs).toEqual([
    ["R1", "D1"],
    ["C1", "R2"],
  ])
  for (const [nearChipId, farChipId] of groundedPairs) {
    const near = layout.chipPlacements[nearChipId!]!
    const far = layout.chipPlacements[farChipId!]!
    expect(near.ccwRotationDegrees).toBe(270)
    expect(far.ccwRotationDegrees).toBe(270)
    expect(near.x).toBe(far.x)
    expect(near.y).toBeGreaterThan(far.y)
  }
  expect(layout.chipPlacements.R1!.x).toBeLessThan(layout.chipPlacements.U1!.x)
  expect(layout.chipPlacements.C1!.x).toBeGreaterThan(
    layout.chipPlacements.U1!.x,
  )
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
