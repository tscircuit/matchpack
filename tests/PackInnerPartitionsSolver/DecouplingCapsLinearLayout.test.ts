import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

test("SingleInnerPartitionPackingSolver places decoupling caps in centered horizontal row", () => {
  // Create a decoupling caps partition with 3 capacitors
  const partitionProblem: PartitionInputProblem = {
    chipMap: {
      C12: {
        chipId: "C12",
        pins: ["C12.1", "C12.2"],
        size: { x: 0.4, y: 0.2 },
        isDecouplingCap: true,
      },
      C18: {
        chipId: "C18",
        pins: ["C18.1", "C18.2"],
        size: { x: 0.4, y: 0.2 },
        isDecouplingCap: true,
      },
      C7: {
        chipId: "C7",
        pins: ["C7.1", "C7.2"],
        size: { x: 0.8, y: 0.4 },
        isDecouplingCap: true,
      },
    },
    chipPinMap: {
      "C12.1": { pinId: "C12.1", offset: { x: -0.1, y: 0 }, side: "x-" },
      "C12.2": { pinId: "C12.2", offset: { x: 0.1, y: 0 }, side: "x+" },
      "C18.1": { pinId: "C18.1", offset: { x: -0.1, y: 0 }, side: "x-" },
      "C18.2": { pinId: "C18.2", offset: { x: 0.1, y: 0 }, side: "x+" },
      "C7.1": { pinId: "C7.1", offset: { x: -0.2, y: 0 }, side: "x-" },
      "C7.2": { pinId: "C7.2", offset: { x: 0.2, y: 0 }, side: "x+" },
    },
    netMap: {
      GND: { netId: "GND" },
      VCC: { netId: "VCC" },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C12.1-VCC": true,
      "C12.2-GND": true,
      "C18.1-VCC": true,
      "C18.2-GND": true,
      "C7.1-VCC": true,
      "C7.2-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
    decouplingCapsGap: 0.3,
    partitionType: "decoupling_caps",
    isPartition: true,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partitionProblem,
    pinIdToStronglyConnectedPins: {},
  })

  // Solver should be solved immediately for decoupling caps
  solver.step()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  // Check that all chips are placed
  const placements = solver.layout!.chipPlacements
  expect(placements.C12).toBeDefined()
  expect(placements.C18).toBeDefined()
  expect(placements.C7).toBeDefined()

  // All chips should be on the same Y-axis (horizontal row)
  expect(placements.C12.y).toBeCloseTo(0, 5)
  expect(placements.C18.y).toBeCloseTo(0, 5)
  expect(placements.C7.y).toBeCloseTo(0, 5)

  // Check ordering: C12 < C18 < C7 (alphabetical by chipId)
  // Total width = 0.4 + 0.3 + 0.4 + 0.3 + 0.8 = 2.2
  // Center = -2.2/2 = -1.1
  // C12 at -1.1 + 0.4/2 = -0.9
  // C18 at -0.9 + 0.4 + 0.3 = -0.4, center = -0.4 + 0.2 = -0.2
  // C7 at -0.2 + 0.4 + 0.3 = 0.5, center = 0.5 + 0.4 = 0.7
  expect(placements.C12.x).toBeCloseTo(-0.9, 5)
  expect(placements.C18.x).toBeCloseTo(-0.2, 5)
  expect(placements.C7.x).toBeCloseTo(0.7, 5)

  // The bounding box should be centered at origin (0, 0)
  // Total width = 2.2, so bounding box goes from -1.1 to 1.1
  const leftEdge = placements.C12.x - 0.2 // C12 width/2 = 0.2
  const rightEdge = placements.C7.x + 0.4 // C7 width/2 = 0.4
  expect(leftEdge).toBeCloseTo(-1.1, 5)
  expect(rightEdge).toBeCloseTo(1.1, 5)
})

test("SingleInnerPartitionPackingSolver handles single decoupling cap", () => {
  const partitionProblem: PartitionInputProblem = {
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.4, y: 0.2 },
        isDecouplingCap: true,
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: -0.1, y: 0 }, side: "x-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0.1, y: 0 }, side: "x+" },
    },
    netMap: {
      GND: { netId: "GND" },
      VCC: { netId: "VCC" },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-VCC": true,
      "C1.2-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
    partitionType: "decoupling_caps",
    isPartition: true,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partitionProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  // Single cap should be centered at origin
  const placements = solver.layout!.chipPlacements
  expect(placements.C1.x).toBeCloseTo(0, 5)
  expect(placements.C1.y).toBeCloseTo(0, 5)
})

test("SingleInnerPartitionPackingSolver uses chipGap when decouplingCapsGap not set", () => {
  const partitionProblem: PartitionInputProblem = {
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.4, y: 0.2 },
        isDecouplingCap: true,
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.4, y: 0.2 },
        isDecouplingCap: true,
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: -0.1, y: 0 }, side: "x-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0.1, y: 0 }, side: "x+" },
      "C2.1": { pinId: "C2.1", offset: { x: -0.1, y: 0 }, side: "x-" },
      "C2.2": { pinId: "C2.2", offset: { x: 0.1, y: 0 }, side: "x+" },
    },
    netMap: {
      GND: { netId: "GND" },
      VCC: { netId: "VCC" },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-VCC": true,
      "C1.2-GND": true,
      "C2.1-VCC": true,
      "C2.2-GND": true,
    },
    chipGap: 0.5, // Use this when decouplingCapsGap is not set
    partitionGap: 2,
    partitionType: "decoupling_caps",
    isPartition: true,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partitionProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()
  expect(solver.solved).toBe(true)

  // Total width = 0.4 + 0.5 + 0.4 = 1.3
  // Center = -1.3/2 = -0.65
  // C1 at -0.65 + 0.4/2 = -0.45
  // C2 at -0.45 + 0.4 + 0.5 = 0.45
  const placements = solver.layout!.chipPlacements
  expect(placements.C1.x).toBeCloseTo(-0.45, 5)
  expect(placements.C2.x).toBeCloseTo(0.45, 5)
})

test("SingleInnerPartitionPackingSolver non-decoupling partition uses PackSolver2", () => {
  const partitionProblem: PartitionInputProblem = {
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
      GND: { netId: "GND" },
      SIGNAL: { netId: "SIGNAL" },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "R1.1-GND": true,
      "R1.2-SIGNAL": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
    // No partitionType means default partition
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partitionProblem,
    pinIdToStronglyConnectedPins: {},
  })

  // Non-decoupling partitions use PackSolver2 and may need multiple steps
  expect(solver.solved).toBe(false)
  solver.step()
  // Should either be solved or have an active sub-solver
  expect(solver.activeSubSolver !== null || solver.solved).toBe(true)
})
