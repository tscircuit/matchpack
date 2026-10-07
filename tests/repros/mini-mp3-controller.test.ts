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
  const output = solver.getOutputLayout()
  const looseTestPointIds = [
    "TP1",
    "TP2",
    "TP5",
    "TP8",
    "TP9",
    "TP10",
    "TP11",
    "TP12",
    "TP13",
    "TP16",
  ]
  expect(
    new Set(looseTestPointIds.map((id) => output.chipPlacements[id]!.y)).size,
  ).toBe(1)
  expect(solver.checkForOverlaps(output)).toHaveLength(0)
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
