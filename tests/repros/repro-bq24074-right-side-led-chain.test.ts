import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import inputProblem from "../assets/repro-bq24074-right-side-led-chain.input.json"

// Captured from @tscircuit/core 0.0.1549's
// "matchpack-input-problem-unnamed_board1" debug output for the BQ24074
// status-LED chain connected to U1's right-side pins:
// U1.5-D1-R4-R5-D2-U1.6.
test("repro bq24074 right-side status LED chain layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()
  const placements = layout.chipPlacements
  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("ParallelSeriesBranchSolver")

  // The same U-shaped topology rotates with the side of U1: each branch is a
  // horizontal row, and corresponding branch elements share an x coordinate.
  expect(placements.D1!.y).toBeCloseTo(placements.R4!.y)
  expect(placements.D2!.y).toBeCloseTo(placements.R5!.y)
  expect(placements.D1!.y).toBeGreaterThan(placements.D2!.y)
  expect(placements.R4!.x).toBeGreaterThan(placements.D1!.x)
  expect(placements.R5!.x).toBeGreaterThan(placements.D2!.x)
  expect(placements.D1!.x).toBeCloseTo(placements.D2!.x)
  expect(placements.R4!.x).toBeCloseTo(placements.R5!.x)

  const getPinPosition = (chipId: string, pinId: string) => {
    const placement = placements[chipId]!
    const pinOffset = rotatePinOffset(
      (inputProblem as InputProblem).chipPinMap[pinId]!.offset,
      placement.ccwRotationDegrees,
    )
    return {
      x: placement.x + pinOffset.x,
      y: placement.y + pinOffset.y,
    }
  }
  expect(getPinPosition("R4", "R4.2").x).toBeCloseTo(
    getPinPosition("R5", "R5.2").x,
  )
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 600,
    svgHeight: 600,
  })
})
