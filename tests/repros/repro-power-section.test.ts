import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import inputProblem from "../assets/repro-power-section.input.json"

test("power section schematic auto-layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  const capacitorRightEdge = Math.max(
    placements.C3!.x + inputProblem.chipMap.C3!.size.y / 2,
    placements.C4!.x + inputProblem.chipMap.C4!.size.y / 2,
  )
  const loadLeftEdge = Math.min(
    placements.R1!.x - inputProblem.chipMap.R1!.size.y / 2,
    placements.LED1!.x - inputProblem.chipMap.LED1!.size.y / 2,
  )

  expect(loadLeftEdge - capacitorRightEdge).toBeCloseTo(
    inputProblem.partitionGap,
  )
  expect(placements.R1!.x).toBeCloseTo(placements.LED1!.x)
  expect(placements.R1!.y - placements.LED1!.y).toBeCloseTo(1.54)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
