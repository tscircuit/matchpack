import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import inputProblem from "../assets/repro-rectifier-series-resistor-alignment.input.json"

// Reduced from a wireless LED rectifier schematic where R_LIMIT is placed
// below D_RECT1, adding an unnecessary elbow between their horizontal pins.
test("rectifier series resistor alignment", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const placements = solver.getOutputLayout().chipPlacements
  const diodePinOffset = rotatePinOffset(
    inputProblem.chipPinMap["D_RECT1.2"]!.offset,
    placements.D_RECT1!.ccwRotationDegrees,
  )
  const resistorPinOffset = rotatePinOffset(
    inputProblem.chipPinMap["R_LIMIT.1"]!.offset,
    placements.R_LIMIT!.ccwRotationDegrees,
  )
  expect(placements.D_RECT1!.y + diodePinOffset.y).toBeCloseTo(
    placements.R_LIMIT!.y + resistorPinOffset.y,
  )
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
