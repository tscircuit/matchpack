import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-battery-charger-status-led-overlap.input.json"

// Captured from BatteryChargerStatusMonitor TSX in @tscircuit/core.
// AlignChipConnectedRailLoadsSolver shifts rail load pairs across the chip
// without checking obstacles, causing R_CHG to overlap the main IC U1.
test("battery charger status LED auto-layout causes U1 and R_CHG component overlap", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const overlaps = solver.checkForOverlaps(solver.getOutputLayout())
  expect(overlaps.length).toBeGreaterThan(0)
  expect(
    overlaps.some(
      (o) =>
        (o.chip1 === "U1" && o.chip2 === "R_CHG") ||
        (o.chip1 === "R_CHG" && o.chip2 === "U1"),
    ),
  ).toBe(true)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
