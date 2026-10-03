import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

const simpleProblem: InputProblem = {
  chipMap: {
    C1: { chipId: "C1", pins: ["P1", "P2"], size: { x: 2.0, y: 1.0 } },
  },
  chipPinMap: {
    P1: { pinId: "P1", offset: { x: 0, y: 0 }, side: normalizeSide("left") },
    P2: {
      pinId: "P2",
      offset: { x: 10, y: 10 },
      side: normalizeSide("right"),
    },
  },
  netMap: {
    N1: { netId: "N1" },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "P1-N1": true,
    "P3-N1": true,
  },
  chipGap: 0.2,
  partitionGap: 2,
}

test("solveUntilPhase terminates immediately when solver is already failed", () => {
  const solver = new LayoutPipelineSolver(simpleProblem)
  solver.failed = true

  let stepCallCount = 0
  const originalStep = solver.step.bind(solver)
  solver.step = () => {
    stepCallCount++
    originalStep()
  }

  // Target a phase that is not reached; must not loop forever
  solver.solveUntilPhase("nonExistentPhase")
  expect(stepCallCount).toBe(0)
  expect(solver.failed).toBe(true)
})

test("solveUntilPhase terminates immediately when solver is already solved", () => {
  const solver = new LayoutPipelineSolver(simpleProblem)
  solver.solve()
  expect(solver.solved).toBe(true)

  let stepCallCount = 0
  const originalStep = solver.step.bind(solver)
  solver.step = () => {
    stepCallCount++
    originalStep()
  }

  // Requesting any phase after solved state must terminate without calling step
  solver.solveUntilPhase("someTargetPhase")
  expect(stepCallCount).toBe(0)
  expect(solver.solved).toBe(true)
})

test("solveUntilPhase terminates safely when sub-solver reaches terminal state or unknown phase", () => {
  const solver = new LayoutPipelineSolver(simpleProblem)

  // Target an unknown phase; solver should proceed until completion/terminal state and not hang
  solver.solveUntilPhase("unknownFuturePhase")
  expect(solver.solved || solver.failed).toBe(true)
})
