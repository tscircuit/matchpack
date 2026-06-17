import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../assets/BQ27441Circuit"

test("BQ27441 battery gauge LayoutPipelineSolver SVG snapshot", async () => {
  const problem = getInputProblemFromCircuitJsonSchematic(
    getExampleCircuitJson(),
    { useReadableIds: true },
  )

  expect(problem.chipMap["U1"]).toBeDefined()
  expect(problem.chipMap["J5"]).toBeDefined()
  expect(Object.keys(problem.chipMap).length).toBe(9)

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "bq27441-battery-gauge",
    svgWidth: 1000,
    svgHeight: 700,
  })
})
