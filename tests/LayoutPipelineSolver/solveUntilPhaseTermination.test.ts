import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getExampleCircuitJson } from "../assets/ExampleCircuit02"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

/**
 * solveUntilPhase must always terminate:
 * - when the pipeline fails mid-run (a sub-solver marks `failed`), the loop's
 *   only stopping condition used to be "current phase == target", so a target
 *   that never arrives spun the event loop forever on no-op steps
 * - the same hang occurred when the pipeline was already solved and an early
 *   phase was requested (getCurrentPhase() is "none" after completion)
 * - requesting a phase that does not exist used to fall into that same hang;
 *   it is a caller bug, so it now fails fast with the list of valid phases
 */

const makeProblem = () => {
  const circuitJson = getExampleCircuitJson()
  return getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
}

test("solveUntilPhase stops when the pipeline fails mid-run", () => {
  const solver = new LayoutPipelineSolver(makeProblem())
  solver.solveUntilPhase("packInnerPartitionsSolver")
  expect(solver.failed).toBe(false)

  // Simulate a sub-solver going terminal-failed during the next steps.
  const realStep = solver.step.bind(solver)
  let stepCalls = 0
  solver.step = () => {
    stepCalls++
    if (stepCalls === 2) solver.failed = true
    realStep()
  }

  // A target beyond the failure point can never be reached; the loop must
  // exit on the failed state instead of stepping forever.
  solver.solveUntilPhase("partitionPackingSolver")
  expect(solver.failed).toBe(true)
  expect(stepCalls).toBe(2)
})

test("solveUntilPhase returns immediately when the pipeline already solved", () => {
  const solver = new LayoutPipelineSolver(makeProblem())
  solver.solve()
  expect(solver.solved).toBe(true)

  const realStep = solver.step.bind(solver)
  let stepCalls = 0
  solver.step = () => {
    stepCalls++
    realStep()
  }

  // Any early-phase request after completion must be a no-op, not a hang
  // (getCurrentPhase() is "none" once the pipeline is exhausted).
  solver.solveUntilPhase("identifyDecouplingCapsSolver")
  expect(stepCalls).toBe(0)
})

test("solveUntilPhase throws with the known phase list for an unknown phase", () => {
  const solver = new LayoutPipelineSolver(makeProblem())

  expect(() => solver.solveUntilPhase("notARealSolverPhase")).toThrow(
    /unknown phase "notARealSolverPhase"/,
  )
  try {
    solver.solveUntilPhase("notARealSolverPhase")
  } catch (e) {
    const message = (e as Error).message
    expect(message).toContain("identifyCrystalCircuitsSolver")
    expect(message).toContain("partitionPackingSolver")
  }
})

test("solveUntilPhase still stops just before the requested phase in normal use", () => {
  const solver = new LayoutPipelineSolver(makeProblem())
  solver.solveUntilPhase("packInnerPartitionsSolver")

  // All phases before the target completed, the target itself has not started
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.getCurrentPhase()).toBe("packInnerPartitionsSolver")

  // And the pipeline still completes normally afterwards
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.partitionPackingSolver?.solved).toBe(true)
})
