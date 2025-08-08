import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

test("LayoutPipelineSolver01 visualization example", () => {
  const problem: InputProblem = {
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
    groupMap: {
      G1: {
        groupId: "G1",
        pins: ["P3"],
        shape: [{ x: 20, y: 20, width: 10, height: 10 } as any],
      },
    },
    groupPinMap: {
      P3: { pinId: "P3", offset: { x: 25, y: 25 } },
    },
    netMap: {
      N1: { netId: "N1" },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "P1-N1": true,
      "P3-N1": true,
    },
  }

  const solver = new LayoutPipelineSolver(problem)
  // solver.solve() // Don't solve, just check initial visualization

  const viz = solver.visualize()

  expect(viz.rects?.length).toBe(1) // 1 chip
  expect(viz.points?.length).toBe(2) // 2 chip pins
  expect(viz.lines?.length).toBe(1) // 1 net
  expect(viz.texts?.length).toBe(1) // 1 for chip
})
