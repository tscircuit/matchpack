import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-battery-charger-status-led-overlap.input.json"

// Captured from BatteryChargerStatusMonitor TSX in @tscircuit/core.
// Status branches on opposite sides of U1 must stay clear of the IC and passives.
test("battery charger status LED branches remain collision-free", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()
  expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
