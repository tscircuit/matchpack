import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-lm386-audio-amp-component-overlap.input.json"

// Captured from the exact Lm386AudioAmplifier TSX in @tscircuit/core.
// Grounded load placement must keep the output and Zobel pairs clear of
// the gain network and bypass capacitor.
test("LM386 audio amplifier components remain collision-free", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()
  expect(Object.keys(outputLayout.chipPlacements).sort()).toEqual(
    Object.keys(input.chipMap).sort(),
  )
  expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)
  expect(
    solver.checkForOverlaps(solver.groundedLoadPairSolver!.outputLayout!),
  ).toHaveLength(0)

  const movedChipIds = new Set(
    solver.groundedLoadPairSolver!.groundedLoadPairs.flatMap((pair) => [
      pair.upperChip.chipId,
      pair.lowerChip.chipId,
    ]),
  )
  const previousLayout = solver.placeNetOnlyDecouplingRowsSolver!.outputLayout!
  for (const [chipId, placement] of Object.entries(
    previousLayout.chipPlacements,
  )) {
    if (movedChipIds.has(chipId)) continue
    expect(outputLayout.chipPlacements[chipId]).toEqual(placement)
  }

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
