import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

const createDecouplingCapProblem = (
  overrides: Partial<PartitionInputProblem> = {},
): PartitionInputProblem => ({
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.1", "C10.2"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0, 180],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 2, y: 0.5 },
      availableRotations: [0, 180],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0, 180],
    },
  },
  chipPinMap: {
    "C10.1": { pinId: "C10.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C10.2": { pinId: "C10.2", offset: { x: 0, y: -0.25 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.25 }, side: "y-" },
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.25 }, side: "y-" },
  },
  netMap: {},
  pinStrongConnMap: {},
  netConnMap: {},
  chipGap: 0.2,
  partitionGap: 2,
  decouplingCapsGap: 0.5,
  isPartition: true,
  partitionType: "decoupling_caps",
  ...overrides,
})

const solveSinglePartition = (inputProblem: PartitionInputProblem) => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: inputProblem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()

  return solver.layout!
}

test("decoupling cap partitions are placed in natural-id order", () => {
  const layout = solveSinglePartition(createDecouplingCapProblem())

  expect(layout.chipPlacements.C1!.x).toBeLessThan(layout.chipPlacements.C2!.x)
  expect(layout.chipPlacements.C2!.x).toBeLessThan(layout.chipPlacements.C10!.x)
})

test("decoupling cap row uses decouplingCapsGap between chip edges", () => {
  const layout = solveSinglePartition(createDecouplingCapProblem())
  const c1 = layout.chipPlacements.C1!
  const c2 = layout.chipPlacements.C2!
  const c10 = layout.chipPlacements.C10!

  expect(c2.x - c1.x).toBeCloseTo(1 / 2 + 0.5 + 2 / 2)
  expect(c10.x - c2.x).toBeCloseTo(2 / 2 + 0.5 + 1 / 2)
})

test("decoupling cap row falls back to chipGap when no decouplingCapsGap is set", () => {
  const layout = solveSinglePartition(
    createDecouplingCapProblem({
      decouplingCapsGap: undefined,
      chipGap: 0.3,
    }),
  )
  const c1 = layout.chipPlacements.C1!
  const c2 = layout.chipPlacements.C2!
  const c10 = layout.chipPlacements.C10!

  expect(c2.x - c1.x).toBeCloseTo(1 / 2 + 0.3 + 2 / 2)
  expect(c10.x - c2.x).toBeCloseTo(2 / 2 + 0.3 + 1 / 2)
})

test("decoupling cap row is centered around the partition origin", () => {
  const layout = solveSinglePartition(createDecouplingCapProblem())
  const leftEdge = layout.chipPlacements.C1!.x - 1 / 2
  const rightEdge = layout.chipPlacements.C10!.x + 1 / 2

  expect(leftEdge).toBeCloseTo(-rightEdge)
})

test("single decoupling cap is centered at the origin", () => {
  const layout = solveSinglePartition(
    createDecouplingCapProblem({
      chipMap: {
        C1: {
          chipId: "C1",
          pins: ["C1.1", "C1.2"],
          size: { x: 1, y: 0.5 },
          availableRotations: [0, 180],
        },
      },
      chipPinMap: {
        "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.25 }, side: "y+" },
        "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.25 }, side: "y-" },
      },
    }),
  )

  expect(layout.chipPlacements.C1).toEqual({
    x: 0,
    y: 0,
    ccwRotationDegrees: 0,
  })
})

test("decoupling cap row uses rotation-aware width", () => {
  const layout = solveSinglePartition(
    createDecouplingCapProblem({
      chipMap: {
        C1: {
          chipId: "C1",
          pins: ["C1.1", "C1.2"],
          size: { x: 2, y: 0.5 },
          availableRotations: [90],
        },
        C2: {
          chipId: "C2",
          pins: ["C2.1", "C2.2"],
          size: { x: 2, y: 0.5 },
          availableRotations: [90],
        },
      },
    }),
  )

  expect(layout.chipPlacements.C1!.ccwRotationDegrees).toBe(90)
  expect(layout.chipPlacements.C2!.ccwRotationDegrees).toBe(90)
  expect(layout.chipPlacements.C2!.x - layout.chipPlacements.C1!.x).toBeCloseTo(
    0.5 / 2 + 0.5 + 0.5 / 2,
  )
})

test("non-decoupling partitions still use the generic pack solver", () => {
  const inputProblem = createDecouplingCapProblem({
    partitionType: "default",
  })
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: inputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.activeSubSolver).toBeDefined()
})
