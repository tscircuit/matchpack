import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

test("SingleInnerPartitionPackingSolver lays out decoupling caps in a centered natural-order row", () => {
  const partitionInputProblem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C10: {
        chipId: "C10",
        pins: [],
        size: { x: 1.5, y: 0.5 },
      },
      C2: {
        chipId: "C2",
        pins: [],
        size: { x: 0.5, y: 0.5 },
      },
      C1: {
        chipId: "C1",
        pins: [],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
    decouplingCapsGap: 0.3,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout?.chipPlacements.C1).toEqual({
    x: -1.3,
    y: 0,
    ccwRotationDegrees: 0,
  })
  expect(solver.layout?.chipPlacements.C2).toEqual({
    x: -0.25,
    y: 0,
    ccwRotationDegrees: 0,
  })
  expect(solver.layout?.chipPlacements.C10).toEqual({
    x: 1.05,
    y: 0,
    ccwRotationDegrees: 0,
  })

  const c1Right =
    solver.layout!.chipPlacements.C1!.x +
    partitionInputProblem.chipMap.C1!.size.x / 2
  const c2Left =
    solver.layout!.chipPlacements.C2!.x -
    partitionInputProblem.chipMap.C2!.size.x / 2
  const c2Right =
    solver.layout!.chipPlacements.C2!.x +
    partitionInputProblem.chipMap.C2!.size.x / 2
  const c10Left =
    solver.layout!.chipPlacements.C10!.x -
    partitionInputProblem.chipMap.C10!.size.x / 2

  expect(c2Left - c1Right).toBeCloseTo(0.3)
  expect(c10Left - c2Right).toBeCloseTo(0.3)
})

test("SingleInnerPartitionPackingSolver falls back to chipGap for decoupling cap spacing", () => {
  const partitionInputProblem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: [],
        size: { x: 1, y: 0.5 },
      },
      C2: {
        chipId: "C2",
        pins: [],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.4,
    partitionGap: 2,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout?.chipPlacements.C1?.x).toBeCloseTo(-0.7)
  expect(solver.layout?.chipPlacements.C2?.x).toBeCloseTo(0.7)
})

test("SingleInnerPartitionPackingSolver respects fixed decoupling cap rotations", () => {
  const partitionInputProblem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: [],
        size: { x: 1, y: 2 },
        availableRotations: [90],
      },
      C2: {
        chipId: "C2",
        pins: [],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout?.chipPlacements.C1?.x).toBeCloseTo(-0.6)
  expect(solver.layout?.chipPlacements.C1?.y).toBe(0)
  expect(solver.layout?.chipPlacements.C1?.ccwRotationDegrees).toBe(90)
  expect(solver.layout?.chipPlacements.C2?.x).toBeCloseTo(1.1)
  expect(solver.layout?.chipPlacements.C2?.y).toBe(0)
  expect(solver.layout?.chipPlacements.C2?.ccwRotationDegrees).toBe(0)
})

test("SingleInnerPartitionPackingSolver places a single decoupling cap at the origin", () => {
  const partitionInputProblem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: [],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout?.chipPlacements.C1).toEqual({
    x: 0,
    y: 0,
    ccwRotationDegrees: 0,
  })
})
