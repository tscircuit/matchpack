import { test, expect } from "bun:test"
import { DecouplingCapsPackingSolver } from "../lib/solvers/PackInnerPartitionsSolver/DecouplingCapsPackingSolver"
import type { PartitionInputProblem } from "../lib/types/InputProblem"

test("DecouplingCapsPackingSolver creates linear layout for decoupling caps", () => {
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2", "U1.3"],
        size: { x: 2, y: 2 },
        availableRotations: [0, 180],
      },
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.5, y: 0.25 },
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.5, y: 0.25 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -1, y: 0.5 }, side: "x-" },
      "U1.2": { pinId: "U1.2", offset: { x: -1, y: -0.5 }, side: "x-" },
      "U1.3": { pinId: "U1.3", offset: { x: 1, y: 0 }, side: "x+" },
      "C1.1": { pinId: "C1.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0.25, y: 0 }, side: "x+" },
      "C2.1": { pinId: "C2.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "C2.2": { pinId: "C2.2", offset: { x: 0.25, y: 0 }, side: "x+" },
    },
    netMap: {
      VCC: ["U1.1", "C1.1"],
      GND: ["U1.2", "C1.2", "C2.2"],
      SIG: ["U1.3", "C2.1"],
    },
    pinDirections: {},
    pinStronglyConnectedPins: {},
    pinStronglyConnectedGroups: {},
    chipGap: 0.2,
    partitionGap: 0.5,
    partitionType: "decoupling_caps",
  }

  const solver = new DecouplingCapsPackingSolver({ partitionInputProblem })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).not.toBeNull()
  expect(solver.layout!.chipPlacements).toBeDefined()

  // Main chip should be placed
  expect(solver.layout!.chipPlacements["U1"]).toBeDefined()

  // Decoupling caps should be placed in a horizontal line
  expect(solver.layout!.chipPlacements["C1"]).toBeDefined()
  expect(solver.layout!.chipPlacements["C2"]).toBeDefined()

  // Caps should be below the main chip (negative y)
  const c1Y = solver.layout!.chipPlacements["C1"]!.y
  const c2Y = solver.layout!.chipPlacements["C2"]!.y
  expect(c1Y).toBeLessThan(0)
  expect(c2Y).toBeLessThan(0)
})

test("DecouplingCapsPackingSolver handles caps without main chip", () => {
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.5, y: 0.25 },
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.5, y: 0.25 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0.25, y: 0 }, side: "x+" },
      "C2.1": { pinId: "C2.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "C2.2": { pinId: "C2.2", offset: { x: 0.25, y: 0 }, side: "x+" },
    },
    netMap: {
      VCC: ["C1.1", "C2.1"],
      GND: ["C1.2", "C2.2"],
    },
    pinDirections: {},
    pinStronglyConnectedPins: {},
    pinStronglyConnectedGroups: {},
    chipGap: 0.2,
    partitionGap: 0.5,
    partitionType: "decoupling_caps",
  }

  const solver = new DecouplingCapsPackingSolver({ partitionInputProblem })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).not.toBeNull()
  expect(solver.layout!.chipPlacements["C1"]).toBeDefined()
  expect(solver.layout!.chipPlacements["C2"]).toBeDefined()
})

test("DecouplingCapsPackingSolver respects decouplingCapsGap", () => {
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2"],
        size: { x: 2, y: 2 },
        availableRotations: [0],
      },
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.5, y: 0.25 },
        availableRotations: [0],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.5, y: 0.25 },
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -1, y: 0.5 }, side: "x-" },
      "U1.2": { pinId: "U1.2", offset: { x: -1, y: -0.5 }, side: "x-" },
      "C1.1": { pinId: "C1.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0.25, y: 0 }, side: "x+" },
      "C2.1": { pinId: "C2.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "C2.2": { pinId: "C2.2", offset: { x: 0.25, y: 0 }, side: "x+" },
    },
    netMap: {
      VCC: ["U1.1", "C1.1"],
      GND: ["U1.2", "C1.2", "C2.2"],
    },
    pinDirections: {},
    pinStronglyConnectedPins: {},
    pinStronglyConnectedGroups: {},
    chipGap: 0.2,
    partitionGap: 0.5,
    decouplingCapsGap: 0.5, // Custom gap for decoupling caps
    partitionType: "decoupling_caps",
  }

  const solver = new DecouplingCapsPackingSolver({ partitionInputProblem })
  solver.solve()

  expect(solver.solved).toBe(true)

  // The gap between caps should be at least decouplingCapsGap (0.5)
  const c1X = solver.layout!.chipPlacements["C1"]!.x
  const c2X = solver.layout!.chipPlacements["C2"]!.x
  const distance = Math.abs(c2X - c1X)

  // Distance should be at least cap width (0.5) + gap (0.5) = 1.0
  expect(distance).toBeGreaterThanOrEqual(0.5 + 0.5 - 0.01) // Small tolerance
})