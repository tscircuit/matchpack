import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"

function makeDecouplingCapPartition(
  capCount: number,
  capSize = { x: 1.0, y: 0.5 },
  gap = 0.2,
): PartitionInputProblem {
  const chipMap: PartitionInputProblem["chipMap"] = {}
  const chipPinMap: PartitionInputProblem["chipPinMap"] = {}
  const netConnMap: PartitionInputProblem["netConnMap"] = {}

  for (let i = 1; i <= capCount; i++) {
    const id = `C${i}`
    chipMap[id] = {
      chipId: id,
      pins: [`${id}.1`, `${id}.2`],
      size: capSize,
      isDecouplingCap: true,
    }
    chipPinMap[`${id}.1`] = {
      pinId: `${id}.1`,
      offset: { x: -capSize.x / 2, y: 0 },
      side: "x-",
    }
    chipPinMap[`${id}.2`] = {
      pinId: `${id}.2`,
      offset: { x: capSize.x / 2, y: 0 },
      side: "x+",
    }
    netConnMap[`${id}.1-VCC`] = true
    netConnMap[`${id}.2-GND`] = true
  }

  return {
    chipMap,
    chipPinMap,
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap,
    chipGap: gap,
    partitionGap: 2,
    decouplingCapsGap: gap,
    partitionType: "decoupling_caps",
    isPartition: true,
  }
}

test("decoupling caps are placed in a horizontal row at y=0", () => {
  const partition = makeDecouplingCapPartition(4)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements).length).toBe(4)

  // All caps should be at y=0 with 0° rotation
  for (const [chipId, p] of Object.entries(placements)) {
    expect(p.y).toBe(0)
    expect(p.ccwRotationDegrees).toBe(0)
  }
})

test("decoupling caps are evenly spaced using decouplingCapsGap", () => {
  const gap = 0.3
  const capSize = { x: 1.0, y: 0.5 }
  const partition = makeDecouplingCapPartition(3, capSize, gap)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const placements = solver.layout!.chipPlacements
  const sortedX = Object.keys(placements)
    .sort()
    .map((id) => placements[id]!.x)

  // Each consecutive pair should be spaced by capSize.x + gap
  const expectedSpacing = capSize.x + gap
  for (let i = 1; i < sortedX.length; i++) {
    expect(sortedX[i]! - sortedX[i - 1]!).toBeCloseTo(expectedSpacing, 5)
  }
})

test("decoupling cap row is centered at origin", () => {
  const capCount = 4
  const capSize = { x: 1.0, y: 0.5 }
  const gap = 0.2
  const partition = makeDecouplingCapPartition(capCount, capSize, gap)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const placements = solver.layout!.chipPlacements
  const xValues = Object.values(placements).map((p) => p.x)
  const centerX = xValues.reduce((a, b) => a + b, 0) / xValues.length

  expect(centerX).toBeCloseTo(0, 5)
})

test("single decoupling cap is placed at origin", () => {
  const partition = makeDecouplingCapPartition(1)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const placements = solver.layout!.chipPlacements
  expect(placements["C1"]).toBeDefined()
  expect(placements["C1"]!.x).toBeCloseTo(0, 5)
  expect(placements["C1"]!.y).toBe(0)
})

test("non-decoupling partitions still use PackSolver2 (no early exit)", () => {
  // A regular partition (no partitionType) should go through PackSolver2
  const regularPartition: PartitionInputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2"],
        size: { x: 2, y: 1 },
      },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -0.5, y: 0 }, side: "x-" },
      "U1.2": { pinId: "U1.2", offset: { x: 0.5, y: 0 }, side: "x+" },
    },
    netMap: { NET1: { netId: "NET1" } },
    pinStrongConnMap: {},
    netConnMap: { "U1.1-NET1": true },
    chipGap: 0.2,
    partitionGap: 2,
    isPartition: true,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: regularPartition,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()
  expect(solver.layout!.chipPlacements["U1"]).toBeDefined()
})
