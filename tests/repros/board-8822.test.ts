import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import type { Placement } from "../../lib/types/OutputLayout"
import { rotatePinOffset } from "../../lib/utils/rotatePinOffset"
import input from "../assets/board-8822.input.json"

const getAbsolutePinY = ({
  pinId,
  placement,
}: {
  pinId: keyof typeof input.chipPinMap
  placement: Placement
}): number => {
  const pin = input.chipPinMap[pinId]
  const rotatedOffset = rotatePinOffset(
    pin.offset,
    placement.ccwRotationDegrees,
  )
  return placement.y + rotatedOffset.y
}

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

  expect(
    solver.alignChipConnectedPowerFiltersSolver?.powerFilters,
  ).toMatchObject([
    {
      mainChipId: "U1",
      mainPinId: "U1.1",
      railComponentChipId: "L1",
      capacitorChipId: "C_VDDA",
    },
  ])
  const layoutBeforePowerFilterAlignment =
    solver.alignChipConnectedRailLoadsSolver!.outputLayout!
  const railComponentPlacementBeforeAlignment =
    layoutBeforePowerFilterAlignment.chipPlacements.L1!
  const capacitorPlacementBeforeAlignment =
    layoutBeforePowerFilterAlignment.chipPlacements.C_VDDA!
  const finalRailComponentPlacement = finalLayout.chipPlacements.L1!
  const finalCapacitorPlacement = finalLayout.chipPlacements.C_VDDA!

  expect(finalRailComponentPlacement.x).toBeLessThan(
    finalLayout.chipPlacements.U1!.x,
  )
  expect(finalCapacitorPlacement.x).toBeLessThan(
    finalLayout.chipPlacements.U1!.x,
  )
  expect(finalRailComponentPlacement.x - finalCapacitorPlacement.x).toBeCloseTo(
    railComponentPlacementBeforeAlignment.x -
      capacitorPlacementBeforeAlignment.x,
  )
  expect(finalRailComponentPlacement.y - finalCapacitorPlacement.y).toBeCloseTo(
    railComponentPlacementBeforeAlignment.y -
      capacitorPlacementBeforeAlignment.y,
  )

  expect(
    solver.alignChipConnectedPullUpRcNetworksSolver?.pullUpRcNetworks,
  ).toMatchObject([
    {
      mainChipId: "U1",
      mainPinId: "U1.9",
      resistorChipId: "R_EN",
      capacitorChipId: "C_EN",
    },
  ])
  const layoutBeforePullUpRcAlignment =
    solver.alignChipConnectedPowerFiltersSolver!.outputLayout!
  const resistorPlacementBeforePullUpRcAlignment =
    layoutBeforePullUpRcAlignment.chipPlacements.R_EN!
  const capacitorPlacementBeforePullUpRcAlignment =
    layoutBeforePullUpRcAlignment.chipPlacements.C_EN!
  const finalResistorPlacement = finalLayout.chipPlacements.R_EN!
  const finalResetCapacitorPlacement = finalLayout.chipPlacements.C_EN!
  const mainPinY = getAbsolutePinY({
    pinId: "U1.9",
    placement: finalLayout.chipPlacements.U1!,
  })
  const resistorMainPinY = getAbsolutePinY({
    pinId: "R_EN.2",
    placement: finalResistorPlacement,
  })

  expect(finalResistorPlacement.x).toBeLessThan(
    finalLayout.chipPlacements.U1!.x,
  )
  expect(finalResetCapacitorPlacement.x).toBeLessThan(
    finalLayout.chipPlacements.U1!.x,
  )
  expect(resistorMainPinY).toBeCloseTo(mainPinY)
  expect(finalResistorPlacement.x - finalResetCapacitorPlacement.x).toBeCloseTo(
    resistorPlacementBeforePullUpRcAlignment.x -
      capacitorPlacementBeforePullUpRcAlignment.x,
  )
  expect(finalResistorPlacement.y - finalResetCapacitorPlacement.y).toBeCloseTo(
    resistorPlacementBeforePullUpRcAlignment.y -
      capacitorPlacementBeforePullUpRcAlignment.y,
  )
  expect(solver.checkForOverlaps(finalLayout)).toEqual([])

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
