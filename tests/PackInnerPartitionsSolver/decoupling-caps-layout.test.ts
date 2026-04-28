import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"

const problem: PartitionInputProblem = {
  isPartition: true,
  partitionType: "decoupling_caps",
  chipGap: 0.25,
  partitionGap: 1,
  decouplingCapsGap: 0.5,
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.1", "C10.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.25 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.25 }, side: "y-" },
    "C10.1": { pinId: "C10.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C10.2": { pinId: "C10.2", offset: { x: 0, y: -0.25 }, side: "y-" },
  },
  netMap: {},
  pinStrongConnMap: {},
  netConnMap: {},
}

test("decoupling capacitor partitions are packed into a clean horizontal row", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements)).toHaveLength(3)
  expect(placements.C1!.y).toBe(0)
  expect(placements.C2!.y).toBe(0)
  expect(placements.C10!.y).toBe(0)
  expect(placements.C1!.x).toBeLessThan(placements.C2!.x)
  expect(placements.C2!.x).toBeLessThan(placements.C10!.x)
  expect(placements.C2!.x - placements.C1!.x).toBeCloseTo(1)
  expect(placements.C10!.x - placements.C2!.x).toBeCloseTo(1)
})
