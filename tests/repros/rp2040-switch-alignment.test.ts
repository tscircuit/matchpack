import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getGroundedLoadPairs } from "../../lib/solvers/GroundedLoadPairSolver/getGroundedLoadPairs"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/rp2040-status-swd-debug.input.json"

test("align grounded multi-pad switches beneath their pull-up resistors", () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()
  const layout = solver.getOutputLayout()
  for (const [resistor, button] of [
    ["R_BOOT", "SW_BOOT"],
    ["R_RUN", "SW_RUN"],
  ]) {
    const upper = layout.chipPlacements[resistor!]!
    const lower = layout.chipPlacements[button!]!
    expect(lower.ccwRotationDegrees).toBe(270)
    expect(lower.x).toBeCloseTo(upper.x, 8)
    expect(lower.y).toBeLessThan(upper.y)
  }
  expect(solver.checkForOverlaps(layout)).toEqual([])
})

test("do not reposition a fixed multi-pad switch", () => {
  const problem = structuredClone(input) as InputProblem
  problem.chipMap.SW_BOOT!.fixedPosition = { x: 10, y: 5 }
  const pairs = getGroundedLoadPairs(problem)
  expect(pairs.some((pair) => pair.lowerChip.chipId === "SW_BOOT")).toBe(false)
})

test("do not treat a four-terminal chip as a two-terminal load", () => {
  const problem = structuredClone(input) as InputProblem
  problem.chipPinMap["SW_BOOT.2"]!.offset.y = 1
  problem.chipPinMap["SW_BOOT.4"]!.offset.y = -1
  const pairs = getGroundedLoadPairs(problem)
  expect(pairs.some((pair) => pair.lowerChip.chipId === "SW_BOOT")).toBe(false)
})

test("respect restricted switch rotations", () => {
  const problem = structuredClone(input) as InputProblem
  problem.chipMap.SW_BOOT!.availableRotations = [0]
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(
    solver.getOutputLayout().chipPlacements.SW_BOOT!.ccwRotationDegrees,
  ).toBe(0)
})

test("align the signal LED pair with the grounded control row", () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()
  const placements = solver.getOutputLayout().chipPlacements
  expect(placements.R_LED!.x).toBeCloseTo(placements.D1!.x, 8)
  expect(placements.R_LED!.y).toBeGreaterThan(placements.D1!.y)
  // Both LEDs have the same symbol geometry and ground terminal offset.
  expect(placements.D1!.y).toBeCloseTo(placements.D_PWR!.y, 8)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toEqual([])
})
