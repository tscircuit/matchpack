import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/debug-leds-section.input.json"

test("reproduces debug LEDs section layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  for (const [ledId, resistorId] of [
    ["LED4", "R15"],
    ["LED5", "R16"],
    ["LED6", "R17"],
  ] as const) {
    expect(placements[ledId]!.x).toBeCloseTo(placements[resistorId]!.x)
    expect(placements[ledId]!.y).toBeGreaterThan(placements[resistorId]!.y)
  }
  expect(placements.LED4!.y).toBeCloseTo(placements.LED5!.y)
  expect(placements.LED5!.y).toBeCloseTo(placements.LED6!.y)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
