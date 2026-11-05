import { expect, test } from "bun:test"
import { BaseSolver } from "../lib/solvers/BaseSolver"
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"

class FailingPhaseSolver extends BaseSolver {
  override _step() {
    this.error = "phase failed"
    this.failed = true
  }
}

class PassingPhaseSolver extends BaseSolver {
  override _step() {
    this.solved = true
  }
}

test("solveUntilPhase stops when an earlier phase fails before reaching target phase", () => {
  const solver = new LayoutPipelineSolver({
    chipMap: {},
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 1,
    partitionGap: 2,
  })
  ;(solver as any).pipelineDef = [
    {
      solverName: "firstPhase",
      solverClass: FailingPhaseSolver,
      getConstructorParams: () => [],
    },
    {
      solverName: "targetPhase",
      solverClass: PassingPhaseSolver,
      getConstructorParams: () => [],
    },
  ]

  solver.solveUntilPhase("targetPhase")

  expect(solver.failed).toBe(true)
  expect(solver.error).toBe("phase failed")
  expect(solver.getCurrentPhase()).toBe("firstPhase")
})

test("solveUntilPhase stops when pipeline completes without matching target phase", () => {
  const solver = new LayoutPipelineSolver({
    chipMap: {},
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 1,
    partitionGap: 2,
  })
  ;(solver as any).pipelineDef = [
    {
      solverName: "onlyPhase",
      solverClass: PassingPhaseSolver,
      getConstructorParams: () => [],
    },
  ]

  solver.solveUntilPhase("nonExistentPhase")

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.getCurrentPhase()).toBe("none")
})
