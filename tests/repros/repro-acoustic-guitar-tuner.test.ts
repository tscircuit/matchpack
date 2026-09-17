import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../assets/repro-acoustic-guitar-tuner.input.json"

// Captured by reapplying core's layout to exported Circuit JSON, without the original TSX props.
// Core: 5eee1add440ab66c8986b395cbd87ee00acad7b2; Matchpack: 32dad82ed2324dad4a994f4b88afbee58f73b7fc.
test("acoustic guitar tuner core layout repro", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 600,
  })
})
