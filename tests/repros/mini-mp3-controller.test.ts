import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../assets/mini-mp3-controller.input.json"

// Derived from mini-mp3-player.json's controller sheet (32 components, 96 pins).
// Uses the Circuit JSON converter's default gaps and the export's rail flags.
// This is a reconstructed layout input, not Core's original debug capture:
// reserved sizes, placement constraints, and original gaps are unavailable.
test("mini mp3 player controller sheet layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
