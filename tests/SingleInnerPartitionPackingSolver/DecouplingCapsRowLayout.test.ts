import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

const createDecouplingCapPartition = (): PartitionInputProblem => ({
  isPartition: true,
  partitionType: "decoupling_caps",
  chipGap: 0.8,
  partitionGap: 1,
  decouplingCapsGap: 0.25,
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.1", "C10.2"],
      size: { x: 0.7, y: 0.3 },
      availableRotations: [90, 270],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.4, y: 0.2 },
      availableRotations: [0, 180],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.6, y: 0.25 },
    },
  },
  chipPinMap: {
    "C1.1": { pinId: "C1.1", offset: { x: -0.2, y: 0 }, side: "x-" },
    "C1.2": { pinId: "C1.2", offset: { x: 0.2, y: 0 }, side: "x+" },
    "C2.1": { pinId: "C2.1", offset: { x: -0.15, y: 0 }, side: "x-" },
    "C2.2": { pinId: "C2.2", offset: { x: 0.15, y: 0 }, side: "x+" },
    "C10.1": { pinId: "C10.1", offset: { x: -0.1, y: 0 }, side: "x-" },
    "C10.2": { pinId: "C10.2", offset: { x: 0.1, y: 0 }, side: "x+" },
  },
  netMap: {},
  pinStrongConnMap: {},
  netConnMap: {},
})

test("decoupling cap partitions use deterministic centered row layout", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: createDecouplingCapPartition(),
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.activeSubSolver).toBeUndefined()
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements)).toEqual(["C1", "C2", "C10"])

  expect(placements.C1!.y).toBe(0)
  expect(placements.C2!.y).toBe(0)
  expect(placements.C10!.y).toBe(0)

  expect(placements.C1!.x).toBeLessThan(placements.C2!.x)
  expect(placements.C2!.x).toBeLessThan(placements.C10!.x)

  expect(placements.C1!.ccwRotationDegrees).toBe(0)
  expect(placements.C2!.ccwRotationDegrees).toBe(0)
  expect(placements.C10!.ccwRotationDegrees).toBe(90)

  const leftEdge = placements.C1!.x - 0.6 / 2
  const rightEdge = placements.C10!.x + 0.3 / 2
  expect(leftEdge).toBeCloseTo(-rightEdge)
  expect(placements.C2!.x - placements.C1!.x).toBeCloseTo(
    0.6 / 2 + 0.25 + 0.4 / 2,
  )
  expect(placements.C10!.x - placements.C2!.x).toBeCloseTo(
    0.4 / 2 + 0.25 + 0.3 / 2,
  )
})
