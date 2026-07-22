import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../../pages/repros/repro-adxl345-sch-auto-layout/repro-adxl345-sch-auto-layout.input.json"

test("ADXL345 schematic auto-layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const placements =
    solver.alignPowerGroundRowsSolver!.outputLayout!.chipPlacements
  const u1Left = placements.U1!.x - input.chipMap.U1.size.x / 2
  const rightmostCapEdge = Math.max(
    ...["C1", "C2", "C3"].map((chipId) => {
      const placement = placements[chipId]!
      const chip = input.chipMap[chipId as keyof typeof input.chipMap]
      return placement.x + chip.size.y / 2
    }),
  )
  expect(rightmostCapEdge).toBeLessThan(u1Left)
  expect(
    solver.checkForOverlaps({
      chipPlacements: placements,
      groupPlacements: {},
    }),
  ).toEqual([])

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
