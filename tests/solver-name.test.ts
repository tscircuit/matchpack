import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../lib"

test("LayoutPipelineSolver has a stable solver name", () => {
  const solver = Object.create(
    LayoutPipelineSolver.prototype,
  ) as LayoutPipelineSolver

  expect(solver.getSolverName()).toBe("LayoutPipelineSolver")
})
