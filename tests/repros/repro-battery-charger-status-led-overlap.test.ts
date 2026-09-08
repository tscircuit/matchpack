import { expect, test } from "bun:test"
import { getChipConnectedRailLoadPairs } from "../../lib/solvers/AlignChipConnectedRailLoadsSolver/getChipConnectedRailLoadPairs"
import { getPlacementBounds } from "../../lib/solvers/AlignTestPointsSolver/placementsOverlap"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import {
  getRotatedSize,
  rotatePinOffset,
} from "../../lib/utils/rotatePinOffset"
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

  const placements = outputLayout.chipPlacements
  for (const pair of getChipConnectedRailLoadPairs(input as InputProblem)) {
    const diodePlacement = placements[pair.railComponent.chipId]!
    const resistorPlacement = placements[pair.resistor.chipId]!
    const mainPlacement = placements[pair.mainChipId]!
    const mainPin = solver.inputProblem.chipPinMap[pair.mainPinId]!
    const mainBounds = getPlacementBounds({
      placement: mainPlacement,
      size: solver.inputProblem.chipMap[pair.mainChipId]!.size,
    })
    for (const chip of [pair.railComponent, pair.resistor]) {
      const bounds = getPlacementBounds({
        placement: placements[chip.chipId]!,
        size: chip.size,
      })
      const gap =
        mainPin.side === "x-"
          ? mainBounds.minX - bounds.maxX
          : bounds.minX - mainBounds.maxX
      expect(gap).toBeGreaterThanOrEqual(input.chipGap - 1e-6)
    }
    expect(diodePlacement.x).toBeCloseTo(resistorPlacement.x, 6)
    const diodeSize = getRotatedSize(
      pair.railComponent.size,
      diodePlacement.ccwRotationDegrees,
    )
    const resistorSize = getRotatedSize(
      pair.resistor.size,
      resistorPlacement.ccwRotationDegrees,
    )
    expect(diodePlacement.y - resistorPlacement.y).toBeCloseTo(
      diodeSize.y / 2 + input.chipGap + resistorSize.y / 2,
      6,
    )
    const mainPinOffset = rotatePinOffset(
      mainPin.offset,
      mainPlacement.ccwRotationDegrees,
    )
    const resistorPinOffset = rotatePinOffset(
      solver.inputProblem.chipPinMap[pair.resistorMainPinId]!.offset,
      resistorPlacement.ccwRotationDegrees,
    )
    expect(
      resistorPlacement.y +
        resistorPinOffset.y -
        (mainPlacement.y + mainPinOffset.y),
    ).toBeCloseTo(0.2, 6)
  }

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
