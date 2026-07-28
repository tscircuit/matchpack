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

test("AlignTestPointsSolver groups and places anchored testpoints", async () => {
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
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "anchored-testpoints",
  })
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

test("AlignTestPointsSolver moves an anchored group outward past a blocker", () => {
  const problemWithBlocker = structuredClone(problem)
  problemWithBlocker.chipMap.BLOCKER = {
    chipId: "BLOCKER",
    pins: [],
    size: { x: 0.4, y: 0.8 },
  }
  const layoutWithBlocker = structuredClone(inputLayout)
  layoutWithBlocker.chipPlacements.BLOCKER = {
    x: -1.6,
    y: 0,
    ccwRotationDegrees: 0,
  }

  const solver = new AlignTestPointsSolver({
    inputProblem: problemWithBlocker,
    inputLayout: layoutWithBlocker,
  })
  solver.solve()

  expect(solver.outputLayout!.chipPlacements.TP1!.x).toBeLessThan(-1.8)
  expect(solver.outputLayout!.chipPlacements.TP2!.x).toBeLessThan(-1.8)
  expect(solver.outputLayout!.chipPlacements.BLOCKER).toEqual(
    layoutWithBlocker.chipPlacements.BLOCKER,
  )
})

test("AlignTestPointsSolver groups only testpoints on nearby anchor pins", () => {
  const problemWithPinGap: InputProblem = structuredClone(problem)
  problemWithPinGap.chipMap.U1!.pins.push("U1.left3", "U1.left4", "U1.left7")
  problemWithPinGap.chipPinMap["U1.left3"] = {
    pinId: "U1.left3",
    offset: { x: -1.2, y: 0.3 },
    side: "x-",
  }
  problemWithPinGap.chipPinMap["U1.left4"] = {
    pinId: "U1.left4",
    offset: { x: -1.2, y: 0.5 },
    side: "x-",
  }
  problemWithPinGap.chipPinMap["U1.left7"] = {
    pinId: "U1.left7",
    offset: { x: -1.2, y: 0.9 },
    side: "x-",
  }
  problemWithPinGap.chipMap.TP7 = {
    chipId: "TP7",
    pins: ["TP7.1"],
    size: { x: 0.4, y: 0.2 },
    isTestPoint: true,
  }
  problemWithPinGap.chipPinMap["TP7.1"] = {
    pinId: "TP7.1",
    offset: { x: -0.2, y: 0 },
    side: "x-",
  }
  problemWithPinGap.pinStrongConnMap["U1.left7-TP7.1"] = true
  problemWithPinGap.pinStrongConnMap["TP7.1-U1.left7"] = true
  problemWithPinGap.chipMap = {
    U1: problemWithPinGap.chipMap.U1!,
    TP7: problemWithPinGap.chipMap.TP7!,
    TP3: problemWithPinGap.chipMap.TP3!,
    TP2: problemWithPinGap.chipMap.TP2!,
    TP1: problemWithPinGap.chipMap.TP1!,
  }

  const solver = new AlignTestPointsSolver({
    inputProblem: problemWithPinGap,
    inputLayout: {
      ...inputLayout,
      chipPlacements: {
        ...inputLayout.chipPlacements,
        TP7: { x: -4, y: 4, ccwRotationDegrees: 0 },
      },
    },
  })
  solver.solve()

  const leftGroups = solver.testPointSideGroups.filter(
    (group) => group.side === "x-",
  )
  expect(leftGroups).toHaveLength(2)
  expect(
    leftGroups[0]!.members.map((member) => member.testPointChipId),
  ).toEqual(["TP1", "TP2"])
  expect(
    leftGroups[1]!.members.map((member) => member.testPointChipId),
  ).toEqual(["TP7"])
})

test("AlignTestPointsSolver aligns loose testpoints on their nearest axis", () => {
  const looseProblem = structuredClone(problem)
  looseProblem.pinStrongConnMap = {}
  const looseInputLayout = structuredClone(inputLayout)
  looseInputLayout.chipPlacements = {
    ...looseInputLayout.chipPlacements,
    TP1: { x: 5.4, y: -4, ccwRotationDegrees: 0 },
    TP2: { x: 4.6, y: 0, ccwRotationDegrees: 180 },
    TP3: { x: 5, y: 4, ccwRotationDegrees: 90 },
  }

  const solver = new AlignTestPointsSolver({
    inputProblem: looseProblem,
    inputLayout: looseInputLayout,
  })
  solver.solve()

  const output = solver.outputLayout!
  expect(
    new Set(["TP1", "TP2", "TP3"].map((id) => output.chipPlacements[id]!.x))
      .size,
  ).toBe(1)
  expect(
    ["TP1", "TP2", "TP3"].map((id) => output.chipPlacements[id]!.y),
  ).toEqual([-4, 0, 4])
  expect(
    ["TP1", "TP2", "TP3"].map(
      (id) => output.chipPlacements[id]!.ccwRotationDegrees,
    ),
  ).toEqual([0, 180, 90])
})
