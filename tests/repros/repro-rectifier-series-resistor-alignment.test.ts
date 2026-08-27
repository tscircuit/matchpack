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

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
