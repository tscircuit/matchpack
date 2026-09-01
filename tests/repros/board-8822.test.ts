import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/board-8822.input.json"

test("board 8822 schematic layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(
    solver.groundedLoadPairSolver?.groundedLoadPairs.some(
      (groundedLoadPair) => groundedLoadPair.upperChip.isCrystal,
    ),
  ).toBe(false)

  const layoutBeforeGroundedLoadPlacement =
    solver.placeNetOnlyDecouplingRowsSolver!.outputLayout!
  const finalLayout = solver.getOutputLayout()
  const crystalPlacementBeforeGroundedLoadPlacement =
    layoutBeforeGroundedLoadPlacement.chipPlacements.Y1!
  const finalCrystalPlacement = finalLayout.chipPlacements.Y1!

  for (const crystalCircuitChipId of ["Y1", "C_X1", "C_X2"] as const) {
    const placementBeforeGroundedLoadPlacement =
      layoutBeforeGroundedLoadPlacement.chipPlacements[crystalCircuitChipId]!
    const finalPlacement = finalLayout.chipPlacements[crystalCircuitChipId]!

    expect(finalPlacement.x - finalCrystalPlacement.x).toBeCloseTo(
      placementBeforeGroundedLoadPlacement.x -
        crystalPlacementBeforeGroundedLoadPlacement.x,
    )
    expect(finalPlacement.y - finalCrystalPlacement.y).toBeCloseTo(
      placementBeforeGroundedLoadPlacement.y -
        crystalPlacementBeforeGroundedLoadPlacement.y,
    )
    expect(finalPlacement.ccwRotationDegrees).toBe(
      placementBeforeGroundedLoadPlacement.ccwRotationDegrees,
    )
  }
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
