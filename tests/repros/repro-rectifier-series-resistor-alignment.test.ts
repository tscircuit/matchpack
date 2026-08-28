import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import inputProblem from "../assets/repro-rectifier-series-resistor-alignment.input.json"

// Reduced from a wireless LED rectifier schematic where R_LIMIT is placed
// below D_RECT1, adding an unnecessary elbow between their horizontal pins.
test("rectifier series resistor alignment", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const placements = solver.getOutputLayout().chipPlacements
  expect(placements.R_LIMIT!.y).toBe(placements.D_RECT1!.y)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})

test("does not move an explicitly positioned resistor", () => {
  const fixedInput = structuredClone(inputProblem) as InputProblem
  fixedInput.chipMap.R_LIMIT!.fixedPosition = { x: 2.03, y: -0.98 }

  const solver = new LayoutPipelineSolver(fixedInput)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.getOutputLayout().chipPlacements.R_LIMIT).toEqual({
    x: 2.03,
    y: -0.98,
    ccwRotationDegrees: 0,
  })
})
