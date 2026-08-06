import { expect, test } from "bun:test"
import { getBoundFromCenteredRect } from "@tscircuit/math-utils"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-rp2040-power-supply-section.input.json"

// Captured from @tscircuit/core 0.0.1539 with @tscircuit/matchpack 0.0.55.
test("RP2040 power supply section auto-layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const u2Placement = layout.chipPlacements.U2!
  const u2 = input.chipMap.U2!
  const u2Bounds = getBoundFromCenteredRect({
    center: u2Placement,
    width: u2.size.x,
    height: u2.size.y,
  })
  for (const capacitorId of ["C4", "C18"] as const) {
    const capacitorPlacement = layout.chipPlacements[capacitorId]!
    const capacitor = input.chipMap[capacitorId]!
    const capacitorBounds = getBoundFromCenteredRect({
      center: capacitorPlacement,
      width: capacitor.size.x,
      height: capacitor.size.y,
    })
    expect(capacitorBounds.minX).toBeGreaterThanOrEqual(
      u2Bounds.maxX + input.chipGap,
    )
    expect(capacitorBounds.minY).toBeGreaterThanOrEqual(
      u2Bounds.maxY + input.chipGap,
    )
  }
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
