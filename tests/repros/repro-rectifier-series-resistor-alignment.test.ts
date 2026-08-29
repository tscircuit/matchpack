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
  expect(placements).toEqual({
    D_RECT1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    D_RECT2: { x: -2.25, y: 0, ccwRotationDegrees: 0 },
    C_FILTER: { x: -1.125, y: -1.96, ccwRotationDegrees: 0 },
    R_LIMIT: { x: 2.03, y: 0, ccwRotationDegrees: 0 },
    LED1: {
      x: 0.9499999999999998,
      y: -3.1099999999999994,
      ccwRotationDegrees: 0,
    },
  })

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
