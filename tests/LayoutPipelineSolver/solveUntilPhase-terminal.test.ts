import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../assets/ExampleCircuit04"

const observers: Array<{ mockRestore(): void }> = []

afterEach(() => {
  for (const observer of observers.splice(0)) observer.mockRestore()
})

function makeSolver() {
  return new LayoutPipelineSolver(
    getInputProblemFromCircuitJsonSchematic(getExampleCircuitJson(), {
      useReadableIds: true,
    }),
  )
}

/**
 * Call the real step implementation. Fail promptly instead of hanging if the
 * original solveUntilPhase loops again after a terminal state. This observer
 * neither supplies fake phase transitions nor replaces the solver algorithm.
 */
function observeSteps(solver: LayoutPipelineSolver) {
  const originalStep = solver.step.bind(solver)
  let calls = 0
  const observer = spyOn(solver, "step").mockImplementation(() => {
    calls++
    if (solver.failed || solver.solved) {
      throw new Error(
        "terminal-state-no-op: solveUntilPhase called step after termination",
      )
    }
    if (calls > 100_000)
      throw new Error("regression fixture exceeded safety budget")
    originalStep()
  })
  observers.push(observer)
  return observer
}

describe("solveUntilPhase terminal-state regression", () => {
  test("already at target: does not advance", () => {
    const solver = makeSolver()
    const observer = observeSteps(solver)
    solver.solveUntilPhase(solver.getCurrentPhase())
    expect(observer).toHaveBeenCalledTimes(0)
    expect(solver.iterations).toBe(0)
  })

  test("real fixture: reaches an intermediate phase", () => {
    const solver = makeSolver()
    const observer = observeSteps(solver)
    solver.solveUntilPhase("packInnerPartitionsSolver")
    expect(solver.getCurrentPhase()).toBe("packInnerPartitionsSolver")
    expect(solver.chipPartitionsSolver?.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(observer).toHaveBeenCalled()
  })

  test("pre-failed solver: preserves failure without calling step", () => {
    const solver = makeSolver()
    solver.failed = true
    solver.error = "existing failure"
    const observer = observeSteps(solver)
    expect(() =>
      solver.solveUntilPhase("packInnerPartitionsSolver"),
    ).not.toThrow()
    expect(observer).toHaveBeenCalledTimes(0)
    expect(solver.error).toBe("existing failure")
    expect(solver.iterations).toBe(0)
    expect(solver.failed).toBe(true)
  })

  test("pre-solved solver: does not call step for an unmet target", () => {
    const solver = makeSolver()
    solver.solved = true
    const observer = observeSteps(solver)
    expect(() =>
      solver.solveUntilPhase("packInnerPartitionsSolver"),
    ).not.toThrow()
    expect(observer).toHaveBeenCalledTimes(0)
    expect(solver.solved).toBe(true)
    expect(solver.iterations).toBe(0)
  })

  test("failed active subsolver: stops and preserves its error", () => {
    const solver = makeSolver()
    const child = new BaseSolver()
    child.failed = true
    child.error = "child failure"
    solver.activeSubSolver = child
    const observer = observeSteps(solver)
    expect(() =>
      solver.solveUntilPhase("packInnerPartitionsSolver"),
    ).not.toThrow()
    expect(observer).toHaveBeenCalledTimes(1)
    expect(solver.failed).toBe(true)
    expect(solver.error).toBe("child failure")
    expect(solver.activeSubSolver).toBeNull()
    expect(solver.currentPipelineStepIndex).toBe(0)
  })

  test("real iteration-budget failure: returns instead of spinning", () => {
    const solver = makeSolver()
    solver.MAX_ITERATIONS = 0
    const observer = observeSteps(solver)
    expect(() =>
      solver.solveUntilPhase("packInnerPartitionsSolver"),
    ).not.toThrow()
    expect(observer).toHaveBeenCalledTimes(1)
    expect(solver.failed).toBe(true)
    expect(solver.error).toBe("LayoutPipelineSolver ran out of iterations")
    expect(solver.iterations).toBe(1)
  })

  test("unknown target: stops when the real fixture completes", () => {
    const solver = makeSolver()
    observeSteps(solver)
    expect(() => solver.solveUntilPhase("not-a-real-phase")).not.toThrow()
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(solver.getCurrentPhase()).toBe("none")
    expect(
      Object.keys(solver.getOutputLayout().chipPlacements).length,
    ).toBeGreaterThan(0)
  })

  test("completed real fixture: requesting an earlier phase returns", () => {
    const solver = makeSolver()
    const earlierPhase = solver.getCurrentPhase()
    solver.solve()
    expect(solver.solved).toBe(true)
    const iterations = solver.iterations
    const observer = observeSteps(solver)
    expect(() => solver.solveUntilPhase(earlierPhase)).not.toThrow()
    expect(observer).toHaveBeenCalledTimes(0)
    expect(solver.iterations).toBe(iterations)
  })

  test("none sentinel: preserves stopping before the final no-phase step", () => {
    const solver = makeSolver()
    observeSteps(solver)
    solver.solveUntilPhase("none")
    expect(solver.getCurrentPhase()).toBe("none")
    expect(solver.currentPipelineStepIndex).toBe(solver.pipelineDef.length)
    expect(solver.failed).toBe(false)
    expect(solver.solved).toBe(false)
    solver.solve()
    expect(solver.solved).toBe(true)
  })

  test("thrown child errors are not swallowed", () => {
    const solver = makeSolver()
    const failure = new Error("deliberate child exception")
    class ThrowingSolver extends BaseSolver {
      override _step() {
        throw failure
      }
    }
    solver.activeSubSolver = new ThrowingSolver()
    observeSteps(solver)
    expect(() => solver.solveUntilPhase("packInnerPartitionsSolver")).toThrow(
      failure,
    )
    expect(solver.failed).toBe(true)
    expect(solver.error).toContain("deliberate child exception")
  })

  test("intermediate stop followed by solve matches direct solve", () => {
    const direct = makeSolver()
    direct.solve()
    expect(direct.solved).toBe(true)
    const staged = makeSolver()
    observeSteps(staged)
    staged.solveUntilPhase("partitionPackingSolver")
    expect(staged.getCurrentPhase()).toBe("partitionPackingSolver")
    staged.solve()
    expect(staged.solved).toBe(true)
    expect(staged.getOutputLayout()).toEqual(direct.getOutputLayout())
  })
})
