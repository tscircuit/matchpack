import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-grounded-load-pairs-with-unrelated-chip.input.json"

test("preserves grounded load row alignment with an unrelated chip", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements

  for (const [ledId, resistorId] of [
    ["LED1", "R1"],
    ["LED2", "R2"],
  ] as const) {
    expect(placements[ledId]!.x).toBeCloseTo(placements[resistorId]!.x)
    expect(placements[ledId]!.y).toBeGreaterThan(placements[resistorId]!.y)
  }

  expect(placements.LED1!.y).toBeCloseTo(placements.LED2!.y)
  expect(placements.R1!.y).toBeCloseTo(placements.R2!.y)
  expect(placements.LED1!.x).not.toBeCloseTo(placements.LED2!.x)
  expect(placements.C_EXTRA).toMatchObject({ x: 10, y: 10 })

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
