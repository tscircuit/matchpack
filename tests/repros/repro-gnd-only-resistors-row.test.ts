import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-gnd-only-resistors-row.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for a
// board with four resistors whose pin2 goes to net.GND while pin1 is left
// unconnected. Every resistor touches a power/ground rail through one pin only,
// so AlignPowerGroundRowsSolver should still line them up as a single row —
// previously the unconnected pin disqualified the chip and the packed column
// leaked through.
test("repro gnd-only resistors align as one row", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()
  const placements = Object.values(layout.chipPlacements)
  expect(placements).toHaveLength(4)

  const firstY = placements[0]!.y
  for (const placement of placements) {
    expect(placement.ccwRotationDegrees).toBe(270)
    expect(Math.abs(placement.y - firstY)).toBeLessThan(1e-6)
  }

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 900,
    svgHeight: 360,
  })
})
