import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../assets/repro-32khz-crystal-load-caps.input.json"

test("32.768 kHz crystal with two grounded load capacitors", async () => {
  expect((input as InputProblem).chipMap.X1?.isCrystal).toBe(true)
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
