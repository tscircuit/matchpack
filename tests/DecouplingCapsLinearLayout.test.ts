import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../lib/types/InputProblem"

/**
 * Test that decoupling capacitor partitions get a clean linear row layout
 * instead of the generic packing algorithm.
 */
test("decoupling caps partition uses linear row layout", () => {
  const partition: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.5, y: 1.0 },
        isDecouplingCap: true,
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.5, y: 1.0 },
        isDecouplingCap: true,
        availableRotations: [0, 180],
      },
      C3: {
        chipId: "C3",
        pins: ["C3.1", "C3.2"],
        size: { x: 0.5, y: 1.0 },
        isDecouplingCap: true,
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0, y: -0.5 }, side: "y-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0, y: 0.5 }, side: "y+" },
      "C2.1": { pinId: "C2.1", offset: { x: 0, y: -0.5 }, side: "y-" },
      "C2.2": { pinId: "C2.2", offset: { x: 0, y: 0.5 }, side: "y+" },
      "C3.1": { pinId: "C3.1", offset: { x: 0, y: -0.5 }, side: "y-" },
      "C3.2": { pinId: "C3.2", offset: { x: 0, y: 0.5 }, side: "y+" },
    },
    netMap: {
      GND: { netId: "GND", isGround: true },
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-GND": true,
      "C1.2-VCC": true,
      "C2.1-GND": true,
      "C2.2-VCC": true,
      "C3.1-GND": true,
      "C3.2-VCC": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  const layout = solver.layout!
  const placements = layout.chipPlacements

  // All 3 caps should have placements
  expect(placements["C1"]).toBeDefined()
  expect(placements["C2"]).toBeDefined()
  expect(placements["C3"]).toBeDefined()

  // All caps should be on the same Y line (horizontal row)
  expect(placements["C1"]!.y).toBe(0)
  expect(placements["C2"]!.y).toBe(0)
  expect(placements["C3"]!.y).toBe(0)

  // All caps should have 0 rotation
  expect(placements["C1"]!.ccwRotationDegrees).toBe(0)
  expect(placements["C2"]!.ccwRotationDegrees).toBe(0)
  expect(placements["C3"]!.ccwRotationDegrees).toBe(0)

  // Caps should be sorted by chipId and spaced correctly
  // C1 < C2 < C3, so C1.x < C2.x < C3.x
  expect(placements["C1"]!.x).toBeLessThan(placements["C2"]!.x)
  expect(placements["C2"]!.x).toBeLessThan(placements["C3"]!.x)

  // Layout should be centered at origin
  const xs = [placements["C1"]!.x, placements["C2"]!.x, placements["C3"]!.x]
  const minX = Math.min(...xs) - 0.25 // half of chip width
  const maxX = Math.max(...xs) + 0.25
  const center = (minX + maxX) / 2
  expect(Math.abs(center)).toBeLessThan(0.01)

  // No overlaps: gap between adjacent caps should be >= chipGap
  const gap12 =
    placements["C2"]!.x -
    placements["C1"]!.x -
    0.5 // subtract chip widths (0.25 + 0.25)
  const gap23 =
    placements["C3"]!.x -
    placements["C2"]!.x -
    0.5
  expect(gap12).toBeCloseTo(0.2, 5) // chipGap = 0.2
  expect(gap23).toBeCloseTo(0.2, 5)
})

test("decoupling caps layout respects decouplingCapsGap", () => {
  const partition: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.5, y: 1.0 },
        isDecouplingCap: true,
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.5, y: 1.0 },
        isDecouplingCap: true,
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0, y: -0.5 }, side: "y-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0, y: 0.5 }, side: "y+" },
      "C2.1": { pinId: "C2.1", offset: { x: 0, y: -0.5 }, side: "y-" },
      "C2.2": { pinId: "C2.2", offset: { x: 0, y: 0.5 }, side: "y+" },
    },
    netMap: {
      GND: { netId: "GND", isGround: true },
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-GND": true,
      "C1.2-VCC": true,
      "C2.1-GND": true,
      "C2.2-VCC": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
    decouplingCapsGap: 0.5,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  const layout = solver.layout!

  // Gap between caps should use decouplingCapsGap (0.5) not chipGap (0.2)
  const gap =
    layout.chipPlacements["C2"]!.x -
    layout.chipPlacements["C1"]!.x -
    0.5 // subtract chip widths
  expect(gap).toBeCloseTo(0.5, 5)
})

test("non-decoupling partition uses PackSolver2 instead of linear layout", () => {
  const partition: PartitionInputProblem = {
    isPartition: true,
    partitionType: "default",
    chipMap: {
      R1: {
        chipId: "R1",
        pins: ["R1.1", "R1.2"],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {
      "R1.1": { pinId: "R1.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "R1.2": { pinId: "R1.2", offset: { x: 0.25, y: 0 }, side: "x+" },
    },
    netMap: {
      N1: { netId: "N1" },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "R1.1-N1": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })

  // Solve fully — it should go through PackSolver2 path
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()
  expect(solver.layout!.chipPlacements["R1"]).toBeDefined()
})
