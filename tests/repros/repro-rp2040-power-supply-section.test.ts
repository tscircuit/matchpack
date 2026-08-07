import { expect, test } from "bun:test"
import { getBoundFromCenteredRect } from "@tscircuit/math-utils"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import { getVerticalPinClearanceOffset } from "../../lib/utils/getVerticalPinClearanceOffset"
import inputJson from "../assets/repro-rp2040-power-supply-section.input.json"

const input = inputJson as InputProblem

// Captured from @tscircuit/core 0.0.1539 with @tscircuit/matchpack 0.0.55.
test("RP2040 power supply section auto-layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  const chipPinMap = input.chipPinMap as InputProblem["chipPinMap"]
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
      u2Bounds.maxX + input.partitionGap,
    )
    expect(
      getVerticalPinClearanceOffset({
        upperPin: chipPinMap["U2.5"]!,
        upperPlacement: u2Placement,
        lowerPin: chipPinMap[`${capacitorId}.1`]!,
        lowerPlacement: capacitorPlacement,
      }),
    ).toBeCloseTo(0)
  }
  const c4 = input.chipMap.C4!
  const c18 = input.chipMap.C18!
  const c4BodyGap = layout.chipPlacements.C4!.x - c4.size.x / 2 - u2Bounds.maxX
  expect(c4BodyGap).toBeCloseTo(input.partitionGap)
  const capacitorBodyGap =
    layout.chipPlacements.C18!.x -
    layout.chipPlacements.C4!.x -
    c4.size.x / 2 -
    c18.size.x / 2
  expect(capacitorBodyGap).toBeCloseTo(input.decouplingCapsGap!)
  expect(
    solver.checkForOverlaps(
      solver.placeNetOnlyDecouplingRowsSolver!.outputLayout!,
    ),
  ).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
