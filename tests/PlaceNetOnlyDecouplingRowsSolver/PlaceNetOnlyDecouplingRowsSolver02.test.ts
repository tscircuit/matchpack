import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"

const createTwoRailDecouplingProblem = (pinYSpacing: number): InputProblem => ({
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.v33", "U1.v11", "U1.gnd", "U1.io"],
      size: { x: 2.0, y: 3.0 },
      availableRotations: [0],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.6, y: 0.84 },
      isCapacitor: true,
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.6, y: 0.84 },
      isCapacitor: true,
      availableRotations: [0],
    },
    C3: {
      chipId: "C3",
      pins: ["C3.1", "C3.2"],
      size: { x: 0.6, y: 0.84 },
      isCapacitor: true,
      availableRotations: [0],
    },
    C4: {
      chipId: "C4",
      pins: ["C4.1", "C4.2"],
      size: { x: 0.6, y: 0.84 },
      isCapacitor: true,
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "U1.v33": {
      pinId: "U1.v33",
      offset: { x: -1, y: pinYSpacing },
      side: "x-",
    },
    "U1.v11": {
      pinId: "U1.v11",
      offset: { x: -1, y: -pinYSpacing },
      side: "x-",
    },
    "U1.gnd": {
      pinId: "U1.gnd",
      offset: { x: 1, y: -1 },
      side: "x+",
    },
    "U1.io": {
      pinId: "U1.io",
      offset: { x: 1, y: 1 },
      side: "x+",
    },
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.42 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.42 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.42 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.42 }, side: "y-" },
    "C3.1": { pinId: "C3.1", offset: { x: 0, y: 0.42 }, side: "y+" },
    "C3.2": { pinId: "C3.2", offset: { x: 0, y: -0.42 }, side: "y-" },
    "C4.1": { pinId: "C4.1", offset: { x: 0, y: 0.42 }, side: "y+" },
    "C4.2": { pinId: "C4.2", offset: { x: 0, y: -0.42 }, side: "y-" },
  },
  netMap: {
    GND: { netId: "GND", isGround: true },
    V3_3: { netId: "V3_3", isPositiveVoltageSource: true },
    V1_1: { netId: "V1_1", isPositiveVoltageSource: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "U1.v33-V3_3": true,
    "U1.v11-V1_1": true,
    "U1.gnd-GND": true,
    "C1.1-V3_3": true,
    "C1.2-GND": true,
    "C2.1-V3_3": true,
    "C2.2-GND": true,
    "C3.1-V1_1": true,
    "C3.2-GND": true,
    "C4.1-V1_1": true,
    "C4.2-GND": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.4,
  partitionGap: 1.2,
})

test("aligns multiple net-only decoupling rows to their respective rail pins on the same chip side", () => {
  const problem = createTwoRailDecouplingProblem(1.0)
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const u1 = layout.chipPlacements.U1!

  // Both decoupling rows should be on the x- side of U1 at partitionGap distance
  for (const capId of ["C1", "C2", "C3", "C4"] as const) {
    expect(layout.chipPlacements[capId]!.x).toBeLessThan(u1.x - 1.0)
  }

  // V3_3 row (C1, C2) aligns with U1.v33, V1_1 row (C3, C4) aligns with U1.v11
  expect(layout.chipPlacements.C1!.x).toBeCloseTo(layout.chipPlacements.C3!.x)
  expect(layout.chipPlacements.C1!.y).toBeCloseTo(layout.chipPlacements.C2!.y)
  expect(layout.chipPlacements.C3!.y).toBeCloseTo(layout.chipPlacements.C4!.y)
  expect(layout.chipPlacements.C1!.y).toBeCloseTo(u1.y + 1.0 - 0.42 - 0.2)
  expect(layout.chipPlacements.C3!.y).toBeCloseTo(u1.y - 1.0 - 0.42 - 0.2)
  expect(solver.checkForOverlaps(layout)).toEqual([])
})

test("shifts overlapping net-only decoupling rows outward on the same chip side without dropping placement", () => {
  const problem = createTwoRailDecouplingProblem(0.2)
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const u1 = layout.chipPlacements.U1!

  // Both rows must remain on the x- side of U1, with the second row shifted outward
  // past the first row rather than rejected back to an arbitrary position.
  for (const capId of ["C1", "C2", "C3", "C4"] as const) {
    expect(layout.chipPlacements[capId]!.x).toBeLessThan(u1.x - 1.0)
  }
  const firstRowMinX = Math.min(
    layout.chipPlacements.C1!.x,
    layout.chipPlacements.C2!.x,
  )
  const secondRowMaxX = Math.max(
    layout.chipPlacements.C3!.x,
    layout.chipPlacements.C4!.x,
  )
  expect(secondRowMaxX).toBeLessThan(firstRowMinX)
  expect(solver.checkForOverlaps(layout)).toEqual([])
})

test("places multiple net-only decoupling rows on the y+ side of a chip without overlapping", () => {
  const problem = createTwoRailDecouplingProblem(0.5)
  problem.chipPinMap["U1.v33"] = {
    pinId: "U1.v33",
    offset: { x: -0.6, y: 1.5 },
    side: "y+",
  }
  problem.chipPinMap["U1.v11"] = {
    pinId: "U1.v11",
    offset: { x: 0.6, y: 1.5 },
    side: "y+",
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const u1 = layout.chipPlacements.U1!

  for (const capId of ["C1", "C2", "C3", "C4"] as const) {
    expect(layout.chipPlacements[capId]!.y).toBeGreaterThan(u1.y + 1.5)
  }
  expect(layout.chipPlacements.C1!.x).toBeLessThan(layout.chipPlacements.C3!.x)
  expect(solver.checkForOverlaps(layout)).toEqual([])
})
