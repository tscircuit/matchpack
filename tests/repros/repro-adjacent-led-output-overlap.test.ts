import { rotatePinOffset } from "../../lib/utils/rotatePinOffset"
import { getPlacementBounds } from "../../lib/solvers/AlignTestPointsSolver/placementsOverlap"
import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-adjacent-led-output-overlap.input.json"

// Captured from the exact TrafficLightController TSX in @tscircuit/core.
// Adjacent resistor/LED output branches must remain collision-free after the
// grounded-load placement pass.
test("adjacent LED output branches remain collision-free", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()
  const placements = outputLayout.chipPlacements
  expect(placements.R2!.x).toBeLessThan(placements.R1!.x)
  expect(placements.R1!.x).toBeLessThan(placements.R3!.x)
  expect(placements.D2!.x).toBeLessThan(placements.D1!.x)
  expect(placements.D1!.x).toBeLessThan(placements.D3!.x)
  expect(placements.R2!.y - placements.R1!.y).toBeCloseTo(0.2, 6)
  expect(placements.R1!.y - placements.R3!.y).toBeCloseTo(0.2, 6)
  expect(placements.D2!.y - placements.D1!.y).toBeCloseTo(0.2, 6)
  expect(placements.D1!.y - placements.D3!.y).toBeCloseTo(0.2, 6)
  const overlaps = solver.checkForOverlaps(outputLayout)
  expect(overlaps).toHaveLength(0)

  const outputPairs = solver.groundedLoadPairSolver!.groundedLoadPairs.filter(
    (groundedLoadPair) => groundedLoadPair.mainChipId,
  )
  expect(outputPairs).toHaveLength(3)
  for (const groundedLoadPair of outputPairs) {
    const upperPlacement =
      outputLayout.chipPlacements[groundedLoadPair.upperChip.chipId]!
    const lowerPlacement =
      outputLayout.chipPlacements[groundedLoadPair.lowerChip.chipId]!
    const mainPin = solver.inputProblem.chipPinMap[groundedLoadPair.mainPinId!]!
    const mainPlacement =
      outputLayout.chipPlacements[groundedLoadPair.mainChipId!]!
    const resistorPin =
      solver.inputProblem.chipPinMap[groundedLoadPair.upperOuterPinId]!
    const mainPinY =
      mainPlacement.y +
      rotatePinOffset(mainPin.offset, mainPlacement.ccwRotationDegrees).y
    const resistorPinY =
      upperPlacement.y +
      rotatePinOffset(resistorPin.offset, upperPlacement.ccwRotationDegrees).y
    expect(mainPinY - resistorPinY).toBeCloseTo(0.2, 6)
    expect(upperPlacement.x).toBeLessThan(mainPlacement.x)
    expect(lowerPlacement.x).toBeLessThan(mainPlacement.x)
    const mainBounds = getPlacementBounds({
      placement: mainPlacement,
      size: solver.inputProblem.chipMap[groundedLoadPair.mainChipId!]!.size,
    })
    const beforePlacements =
      solver.alignRegulatorCapacitorRowSolver!.outputLayout!.chipPlacements
    const beforeUpper = beforePlacements[groundedLoadPair.upperChip.chipId]!
    const beforeLower = beforePlacements[groundedLoadPair.lowerChip.chipId]!
    expect(upperPlacement.x - lowerPlacement.x).toBeCloseTo(
      beforeUpper.x - beforeLower.x,
      6,
    )
    expect(upperPlacement.y - lowerPlacement.y).toBeCloseTo(
      beforeUpper.y - beforeLower.y,
      6,
    )
    for (const chip of [
      groundedLoadPair.upperChip,
      groundedLoadPair.lowerChip,
    ]) {
      const placement = outputLayout.chipPlacements[chip.chipId]!
      const bounds = getPlacementBounds({ placement, size: chip.size })
      expect(mainBounds.minX - bounds.maxX).toBeGreaterThanOrEqual(
        input.chipGap - 1e-6,
      )
      expect(placement.ccwRotationDegrees).toBe(
        beforePlacements[chip.chipId]!.ccwRotationDegrees,
      )
    }
    expect(upperPlacement.y).toBeGreaterThan(lowerPlacement.y)
    expect(Math.abs(upperPlacement.x - lowerPlacement.x)).toBeLessThanOrEqual(
      input.chipGap,
    )
  }

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
