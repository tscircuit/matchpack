import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import repro44Input from "../assets/repro44-e2e-pack-and-schematic.input.json"

// Regression for a grounded load pair being stacked on top of a neighbouring chip.
//
// GroundedLoadPairSolver re-stacks each grounded two-component chain vertically
// under its main-chip pin, then drops the pair down to clear bodies that sit in
// its column. The clearance pass only accounted for bodies whose top edge was
// above the pair's top edge, so a chip that ended up level with the pair (top at
// or below the pair top) was skipped and left overlapping.
//
// This fixture is the repro44 e2e circuit with the requested chip gap widened to
// 1. At that gap the packer parks R2 level with the R3/D1 grounded load pair, and
// the pair used to land directly on top of R2. A larger requested gap must never
// produce overlapping chips.
test("grounded load pair does not overlap a neighbour level with it", () => {
  const inputProblem = structuredClone(repro44Input) as InputProblem
  inputProblem.chipGap = 1

  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()
  const overlaps = solver.checkForOverlaps(outputLayout)
  expect(overlaps).toHaveLength(0)
})
