import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getRotatedSize } from "../../lib/utils/rotatePinOffset"
import inputProblem from "../assets/repro-e2e-pack-and-schematic.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// the repro44-e2e-pack-and-schematic test (555-timer style circuit: U1 + R1/R2/R3
// + C1/C2 + D1). Lets us inspect/iterate on matchpack's body-level layout here.
test("repro44 e2e pack and schematic layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const placements = solver.getOutputLayout().chipPlacements
  const r1 = placements.R1!
  const r3 = placements.R3!
  const r1Size = getRotatedSize(
    inputProblem.chipMap.R1!.size,
    r1.ccwRotationDegrees,
  )
  const r3Size = getRotatedSize(
    inputProblem.chipMap.R3!.size,
    r3.ccwRotationDegrees,
  )
  const verticalGap = r1.y - r1Size.y / 2 - (r3.y + r3Size.y / 2)
  expect(verticalGap).toBeGreaterThanOrEqual(inputProblem.chipGap - 1e-6)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
