import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-core-repro70-common-node-placement.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// repro70-schematicbox-rotation-autolayout. C1.1 is the common pin for the two
// strong connections FB1.2-C1.1 and C1.1-C3.1. Both neighbors are currently
// placed on the same side of C1, making the FB1-C1 connection unnecessarily
// long.
test("core repro70 places the common node outside its connected neighbors", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const { C1, C3, FB1 } = solver.getOutputLayout().chipPlacements
  const c1ToFb1 = { x: FB1!.x - C1!.x, y: FB1!.y - C1!.y }
  const c1ToC3 = { x: C3!.x - C1!.x, y: C3!.y - C1!.y }
  const directionDotProduct = c1ToFb1.x * c1ToC3.x + c1ToFb1.y * c1ToC3.y

  expect(directionDotProduct).toBeGreaterThan(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 600,
    svgHeight: 600,
  })
})
