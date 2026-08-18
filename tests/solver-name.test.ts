import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../lib"

test("LayoutPipelineSolver has a stable solver name", () => {
  expect(LayoutPipelineSolver.solverName).toBe("LayoutPipelineSolver")
})
