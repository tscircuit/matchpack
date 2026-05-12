import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

function makeDecouplingCapPartition(
  chipIds: string[],
  capSize = { x: 1.0, y: 0.5 },
  gap = 0.2,
  decouplingCapsGap?: number,
): PartitionInputProblem {
  const chipMap: PartitionInputProblem["chipMap"] = {}
  const chipPinMap: PartitionInputProblem["chipPinMap"] = {}

  for (const id of chipIds) {
    chipMap[id] = {
      chipId: id,
      pins: [`${id}.1`, `${id}.2`],
      size: capSize,
      isDecouplingCap: true,
      availableRotations: [0, 90, 180, 270],
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
  }

  return {
    chipMap,
    chipPinMap,
    netMap: { GND: { netId: "GND", isGround: true } },
    pinStrongConnMap: {},
    netConnMap: Object.fromEntries(
      chipIds.flatMap((id) => [[`${id}.2-GND`, true as const]]),
    ),
    chipGap: gap,
    partitionGap: 2,
    decouplingCapsGap,
    isPartition: true,
    partitionType: "decoupling_caps",
  }
}

test("decoupling caps arranged in centered horizontal row", () => {
  const problem = makeDecouplingCapPartition(["C1", "C2", "C3"])
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements
  expect(placements["C1"]).toBeDefined()
  expect(placements["C2"]).toBeDefined()
  expect(placements["C3"]).toBeDefined()

  // All caps at y=0 (horizontal row)
  expect(placements["C1"]!.y).toBeCloseTo(0)
  expect(placements["C2"]!.y).toBeCloseTo(0)
  expect(placements["C3"]!.y).toBeCloseTo(0)

  // Sorted by chipId: C1 leftmost, C3 rightmost
  expect(placements["C1"]!.x).toBeLessThan(placements["C2"]!.x)
  expect(placements["C2"]!.x).toBeLessThan(placements["C3"]!.x)

  // Centered: average x should be ~0
  const avgX =
    (placements["C1"]!.x + placements["C2"]!.x + placements["C3"]!.x) / 3
  expect(avgX).toBeCloseTo(0, 5)

  // All at rotation 0
  expect(placements["C1"]!.ccwRotationDegrees).toBe(0)
  expect(placements["C2"]!.ccwRotationDegrees).toBe(0)
  expect(placements["C3"]!.ccwRotationDegrees).toBe(0)
})

test("decoupling cap spacing uses decouplingCapsGap when provided", () => {
  const chipGap = 0.2
  const decouplingCapsGap = 0.05
  const capSize = { x: 1.0, y: 0.5 }

  const problem = makeDecouplingCapPartition(
    ["C1", "C2"],
    capSize,
    chipGap,
    decouplingCapsGap,
  )
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements

  // Expected: C1 at x = -(1.0/2 + decouplingCapsGap/2) = -(0.5 + 0.025) = -0.525
  // C2 at x = +(0.525)
  const expectedSpacing = capSize.x + decouplingCapsGap
  const actualSpacing = placements["C2"]!.x - placements["C1"]!.x
  expect(actualSpacing).toBeCloseTo(expectedSpacing, 5)
})

test("decoupling cap spacing falls back to chipGap when decouplingCapsGap is absent", () => {
  const chipGap = 0.3
  const capSize = { x: 1.0, y: 0.5 }

  const problem = makeDecouplingCapPartition(["C1", "C2"], capSize, chipGap)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements

  const expectedSpacing = capSize.x + chipGap
  const actualSpacing = placements["C2"]!.x - placements["C1"]!.x
  expect(actualSpacing).toBeCloseTo(expectedSpacing, 5)
})

test("non-decoupling partition still uses generic PackSolver2", () => {
  const problem: PartitionInputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2"],
        size: { x: 2, y: 2 },
      },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -0.5, y: 0 }, side: "x-" },
      "U1.2": { pinId: "U1.2", offset: { x: 0.5, y: 0 }, side: "x+" },
    },
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
    isPartition: true,
    partitionType: "default",
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  // Should not be immediately solved (goes through PackSolver2)
  expect(solver.solved).toBe(false)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()
})

test("single decoupling cap centered at origin", () => {
  const problem = makeDecouplingCapPartition(["C5"])
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements
  expect(placements["C5"]!.x).toBeCloseTo(0, 5)
  expect(placements["C5"]!.y).toBeCloseTo(0, 5)
})
