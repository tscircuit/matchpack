import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-lm386-audio-amp-component-overlap.input.json"

// Captured from the exact Lm386AudioAmplifier TSX in @tscircuit/core.
// Keep C_GAIN clear of R_ZOBEL and C_BYPASS clear of C_OUT after
// aligning the chip-connected grounded branches.
test("LM386 audio amplifier components remain collision-free after layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const overlaps = solver.checkForOverlaps(solver.getOutputLayout())
  expect(overlaps).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
