import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../assets/repro-u1-crystal-circuit-json.input.json"

test("U1 crystal circuit from circuit JSON", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
