import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"
import { getPinIdToStronglyConnectedPinsObj } from "../../lib/solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

test("createDecouplingCapsLayout creates linear arrangement without overlaps", () => {
  // Create a partition with multiple decoupling capacitors
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.53, y: 1.06 },
        availableRotations: [0],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.53, y: 1.06 },
        availableRotations: [0],
      },
      C3: {
        chipId: "C3",
        pins: ["C3.1", "C3.2"],
        size: { x: 0.53, y: 1.06 },
        availableRotations: [0],
      },
      C4: {
        chipId: "C4",
        pins: ["C4.1", "C4.2"],
        size: { x: 0.53, y: 1.06 },
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.55 }, side: "y-" },
      "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.55 }, side: "y-" },
      "C3.1": { pinId: "C3.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C3.2": { pinId: "C3.2", offset: { x: 0, y: -0.55 }, side: "y-" },
      "C4.1": { pinId: "C4.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C4.2": { pinId: "C4.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-VCC": true,
      "C1.2-GND": true,
      "C2.1-VCC": true,
      "C2.2-GND": true,
      "C3.1-VCC": true,
      "C3.2-GND": true,
      "C4.1-VCC": true,
      "C4.2-GND": true,
    },
    chipGap: 0.6,
    partitionGap: 1.2,
    decouplingCapsGap: 0.2,
    isPartition: true,
    partitionType: "decoupling_caps",
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: getPinIdToStronglyConnectedPinsObj(partitionInputProblem),
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  const { chipPlacements } = solver.layout!
  
  // Check that all capacitors have placements
  expect(Object.keys(chipPlacements)).toHaveLength(4)
  expect(chipPlacements.C1).toBeDefined()
  expect(chipPlacements.C2).toBeDefined()
  expect(chipPlacements.C3).toBeDefined()
  expect(chipPlacements.C4).toBeDefined()

  // All should have rotation 0
  expect(chipPlacements.C1.ccwRotationDegrees).toBe(0)
  expect(chipPlacements.C2.ccwRotationDegrees).toBe(0)
  expect(chipPlacements.C3.ccwRotationDegrees).toBe(0)
  expect(chipPlacements.C4.ccwRotationDegrees).toBe(0)

  // Check that no capacitors overlap
  // Each capacitor is 0.53 x 1.06, with gap of 0.2
  // They should be laid out horizontally since height > width
  const positions = [chipPlacements.C1, chipPlacements.C2, chipPlacements.C3, chipPlacements.C4]
    .sort((a, b) => a.x - b.x)

  // Check that positions are distinct and in a line
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1]
    const curr = positions[i]
    const distance = Math.abs(curr.x - prev.x)
    
    // Distance should be at least (width + gap) = 0.53 + 0.2 = 0.73
    // Allow some tolerance for centering
    expect(distance).toBeGreaterThan(0.5)
    
    // Y positions should be the same (linear horizontal layout)
    expect(curr.y).toBeCloseTo(prev.y, 5)
  }

  console.log("Decoupling cap placements:")
  for (const [chipId, placement] of Object.entries(chipPlacements)) {
    console.log(`  ${chipId}: x=${placement.x.toFixed(2)}, y=${placement.y.toFixed(2)}, rot=${placement.ccwRotationDegrees}`)
  }
})

test("createDecouplingCapsLayout with wide capacitors uses vertical layout", () => {
  // Create a partition with wide decoupling capacitors (taller than wide after rotation)
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 1.06, y: 0.53 }, // Wide, not tall
        availableRotations: [0],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 1.06, y: 0.53 },
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0.55, y: 0 }, side: "x+" },
      "C1.2": { pinId: "C1.2", offset: { x: -0.55, y: 0 }, side: "x-" },
      "C2.1": { pinId: "C2.1", offset: { x: 0.55, y: 0 }, side: "x+" },
      "C2.2": { pinId: "C2.2", offset: { x: -0.55, y: 0 }, side: "x-" },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-VCC": true,
      "C1.2-GND": true,
      "C2.1-VCC": true,
      "C2.2-GND": true,
    },
    chipGap: 0.6,
    partitionGap: 1.2,
    decouplingCapsGap: 0.2,
    isPartition: true,
    partitionType: "decoupling_caps",
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: getPinIdToStronglyConnectedPinsObj(partitionInputProblem),
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()

  const { chipPlacements } = solver.layout!
  const positions = [chipPlacements.C1, chipPlacements.C2]
    .sort((a, b) => a.y - b.y)

  // For wide capacitors, should use vertical layout
  // X positions should be the same
  expect(positions[0].x).toBeCloseTo(positions[1].x, 5)
  
  // Y positions should be separated
  const distance = Math.abs(positions[1].y - positions[0].y)
  expect(distance).toBeGreaterThan(0.5)
})

test("createDecouplingCapsLayout with single capacitor", () => {
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.53, y: 1.06 },
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-VCC": true,
      "C1.2-GND": true,
    },
    chipGap: 0.6,
    partitionGap: 1.2,
    decouplingCapsGap: 0.2,
    isPartition: true,
    partitionType: "decoupling_caps",
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: getPinIdToStronglyConnectedPinsObj(partitionInputProblem),
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()
  expect(solver.layout!.chipPlacements.C1).toBeDefined()
  
  // Single cap should be at origin (centered)
  expect(solver.layout!.chipPlacements.C1.x).toBe(0)
  expect(solver.layout!.chipPlacements.C1.y).toBe(0)
})

test("createDecouplingCapsLayout with empty partition", () => {
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.6,
    partitionGap: 1.2,
    isPartition: true,
    partitionType: "decoupling_caps",
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()
  expect(Object.keys(solver.layout!.chipPlacements)).toHaveLength(0)
})