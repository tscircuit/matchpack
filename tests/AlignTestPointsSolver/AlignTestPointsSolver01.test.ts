import { expect, test } from "bun:test"
import { AlignTestPointsSolver } from "lib/solvers/AlignTestPointsSolver/AlignTestPointsSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"

const problem: InputProblem = {
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.left1", "U1.left2", "U1.right1"],
      size: { x: 2, y: 4 },
    },
    TP1: {
      chipId: "TP1",
      pins: ["TP1.1"],
      size: { x: 0.4, y: 0.2 },
      isTestPoint: true,
    },
    TP2: {
      chipId: "TP2",
      pins: ["TP2.1"],
      size: { x: 0.4, y: 0.2 },
      isTestPoint: true,
    },
    TP3: {
      chipId: "TP3",
      pins: ["TP3.1"],
      size: { x: 0.4, y: 0.2 },
      isTestPoint: true,
    },
  },
  chipPinMap: {
    "U1.left1": {
      pinId: "U1.left1",
      offset: { x: -1.2, y: -0.1 },
      side: "x-",
    },
    "U1.left2": {
      pinId: "U1.left2",
      offset: { x: -1.2, y: 0.1 },
      side: "x-",
    },
    "U1.right1": {
      pinId: "U1.right1",
      offset: { x: 1.2, y: 0 },
      side: "x+",
    },
    "TP1.1": { pinId: "TP1.1", offset: { x: -0.2, y: 0 }, side: "x-" },
    "TP2.1": { pinId: "TP2.1", offset: { x: -0.2, y: 0 }, side: "x-" },
    "TP3.1": { pinId: "TP3.1", offset: { x: -0.2, y: 0 }, side: "x-" },
  },
  netMap: {},
  pinStrongConnMap: {
    "U1.left1-TP1.1": true,
    "TP1.1-U1.left1": true,
    "U1.left2-TP2.1": true,
    "TP2.1-U1.left2": true,
    "U1.right1-TP3.1": true,
    "TP3.1-U1.right1": true,
  },
  netConnMap: {},
  chipGap: 0.2,
  partitionGap: 1,
}

const inputLayout: OutputLayout = {
  chipPlacements: {
    U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    TP1: { x: 3, y: 3, ccwRotationDegrees: 0 },
    TP2: { x: -3, y: 3, ccwRotationDegrees: 0 },
    TP3: { x: 0, y: -3, ccwRotationDegrees: 180 },
  },
  groupPlacements: {},
}

test("AlignTestPointsSolver groups testpoints by anchor pin side", () => {
  const solver = new AlignTestPointsSolver({
    inputProblem: problem,
    inputLayout,
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.testPointSideGroups).toHaveLength(2)

  const output = solver.outputLayout!
  expect(output.chipPlacements.TP1!.x).toBeLessThan(-1.2)
  expect(output.chipPlacements.TP2!.x).toBeLessThan(-1.2)
  expect(output.chipPlacements.TP3!.x).toBeGreaterThan(1.2)
  expect(output.chipPlacements.TP1!.ccwRotationDegrees).toBe(180)
  expect(output.chipPlacements.TP2!.ccwRotationDegrees).toBe(180)
  expect(output.chipPlacements.TP3!.ccwRotationDegrees).toBe(0)
  expect(
    Math.abs(output.chipPlacements.TP1!.y - output.chipPlacements.TP2!.y),
  ).toBeGreaterThanOrEqual(0.4)
})

test("AlignTestPointsSolver follows rotated anchor pin sides", () => {
  const rotatedInputLayout: OutputLayout = {
    ...inputLayout,
    chipPlacements: {
      ...inputLayout.chipPlacements,
      U1: { x: 0, y: 0, ccwRotationDegrees: 90 },
    },
  }
  const solver = new AlignTestPointsSolver({
    inputProblem: problem,
    inputLayout: rotatedInputLayout,
  })
  solver.solve()

  const output = solver.outputLayout!
  expect(output.chipPlacements.TP1!.y).toBeLessThan(-1.2)
  expect(output.chipPlacements.TP2!.y).toBeLessThan(-1.2)
  expect(output.chipPlacements.TP3!.y).toBeGreaterThan(1.2)
  expect(output.chipPlacements.TP1!.ccwRotationDegrees).toBe(270)
  expect(output.chipPlacements.TP2!.ccwRotationDegrees).toBe(270)
  expect(output.chipPlacements.TP3!.ccwRotationDegrees).toBe(90)
})
