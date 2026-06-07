import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import example01Problem from "../../pages/examples/example01/inputProblem.json"
import example02Problem from "../../pages/examples/example02/inputProblem.json"
import type { InputProblem } from "lib/types/InputProblem"

test("LayoutPipelineSolver: example01 iteration 0 visualization respects fixed position and label", () => {
  const problem = example01Problem as InputProblem
  const solver = new LayoutPipelineSolver(problem)
  const viz = solver.visualize()

  // Find the rect and text for C5 (which is the fixed component)
  const c5Rect = viz.rects?.find((r) => r.label === "C5 (fixed)")
  const c5Text = viz.texts?.find((t) => t.text === "C5 (fixed)")

  expect(c5Rect).toBeDefined()
  expect(c5Rect!.center.x).toBeCloseTo(4, 5)
  expect(c5Rect!.center.y).toBeCloseTo(2, 5)

  expect(c5Text).toBeDefined()
  expect(c5Text!.x).toBeCloseTo(4, 5)
  expect(c5Text!.y).toBeCloseTo(2, 5)
})

test("LayoutPipelineSolver: example02 iteration 0 visualization respects fixed positions and labels", () => {
  const problem = example02Problem as InputProblem
  const solver = new LayoutPipelineSolver(problem)
  const viz = solver.visualize()

  // In example02, C2 (fixed at 2,2) and C5 (fixed at 4,2) are fixed
  const c2Rect = viz.rects?.find((r) => r.label === "C2 (fixed)")
  const c2Text = viz.texts?.find((t) => t.text === "C2 (fixed)")
  const c5Rect = viz.rects?.find((r) => r.label === "C5 (fixed)")
  const c5Text = viz.texts?.find((t) => t.text === "C5 (fixed)")

  expect(c2Rect).toBeDefined()
  expect(c2Rect!.center.x).toBeCloseTo(2, 5)
  expect(c2Rect!.center.y).toBeCloseTo(2, 5)

  expect(c2Text).toBeDefined()
  expect(c2Text!.x).toBeCloseTo(2, 5)
  expect(c2Text!.y).toBeCloseTo(2, 5)

  expect(c5Rect).toBeDefined()
  expect(c5Rect!.center.x).toBeCloseTo(4, 5)
  expect(c5Rect!.center.y).toBeCloseTo(2, 5)

  expect(c5Text).toBeDefined()
  expect(c5Text!.x).toBeCloseTo(4, 5)
  expect(c5Text!.y).toBeCloseTo(2, 5)
})
