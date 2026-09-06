import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-lm386-audio-amp-component-overlap.input.json"

// Captured from the exact Lm386AudioAmplifier TSX in @tscircuit/core.
// Matchpack reports a solved layout even though peripheral passives
// (C_GAIN with R_ZOBEL and C_BYPASS with C_OUT) physically overlap.
test("LM386 audio amplifier components overlap after layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const overlaps = solver.checkForOverlaps(solver.getOutputLayout())
  expect(overlaps).toHaveLength(2)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
