import { describe, expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getExampleCircuitJson } from "../assets/ExampleCircuit02"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

const makeProblem = () => {
  const circuitJson = getExampleCircuitJson()
  return getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
}

/**
 * Issue #267: solveUntilPhase() only checked getCurrentPhase() !== phase, so
 * whenever the current phase became terminal before the requested phase was
 * reached (sub-solver failure, unknown phase, pipeline already solved), the
 * loop kept calling a no-op step() forever and blocked the event loop.
 */
describe("LayoutPipelineSolver.solveUntilPhase terminal guards", () => {
  test("returns immediately when the requested phase is current", () => {
    const solver = new LayoutPipelineSolver(makeProblem())
    const firstPhase = solver.pipelineDef[0]!.solverName
    const before = solver.getCurrentPhase()
    expect(before).toBe(firstPhase)
    solver.solveUntilPhase(firstPhase)
    expect(solver.getCurrentPhase()).toBe(firstPhase)
    expect(solver.solved).toBe(false)
    expect(solver.failed).toBe(false)
  })

  test("terminates instead of spinning when a sub-solver fails mid-pipeline", () => {
    class SyntheticallyFailing extends LayoutPipelineSolver {
      override step() {
        this.failed = true
        this.error = "synthetic failure for def-267 regression"
      }
    }
    const solver = new SyntheticallyFailing(makeProblem() as never)
    const unreachablePhase = "neverReachedPhaseName"
    // Without the !failed guard this loop spins forever (bun test timeout
    // makes it fail instead of hanging).
    solver.solveUntilPhase(unreachablePhase)
    expect(solver.failed).toBe(true)
    expect(solver.error).toContain("synthetic failure for def-267")
  })

  test("terminates for a phase name that is not in the pipeline", () => {
    const solver = new LayoutPipelineSolver(makeProblem())
    solver.solveUntilPhase("nonexistentPhaseName")
    // The pipeline ran to completion and stopped; no infinite loop.
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
  })

  test("terminates when the pipeline is already solved", () => {
    const solver = new LayoutPipelineSolver(makeProblem())
    solver.solve()
    expect(solver.solved).toBe(true)
    const currentPhase = solver.getCurrentPhase()
    solver.solveUntilPhase("unreachableAfterSolved")
    expect(solver.getCurrentPhase()).toBe(currentPhase)
  })

  test("failed state is preserved and stored while entering phase early", () => {
    class FailingAfterPhase1 extends LayoutPipelineSolver {
      override step() {
        super.step()
        if (this.getCurrentPhase() === "packInnerPartitionsSolver") {
          this.failed = true
          this.error = "pipeline stall after phase 1"
        }
      }
    }
    const solver = new FailingAfterPhase1(makeProblem() as never)
    const laterPhase = solver.pipelineDef.at(-1)!.solverName
    solver.solveUntilPhase(laterPhase)
    expect(solver.failed).toBe(true)
  })
})
