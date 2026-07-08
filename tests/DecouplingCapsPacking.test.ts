import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../lib/types/InputProblem"

test("SingleInnerPartitionPackingSolver arranges decoupling capacitors in a clean horizontal row", () => {
  const problem: PartitionInputProblem = {
    chipMap: {
      C1: { chipId: "C1", pins: ["C1.1", "C1.2"], size: { x: 1, y: 2 } },
      C2: { chipId: "C2", pins: ["C2.1", "C2.2"], size: { x: 1, y: 2 } },
      C3: { chipId: "C3", pins: ["C3.1", "C3.2"], size: { x: 1, y: 2 } },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0, y: 1 }, side: "y+" },
      "C1.2": { pinId: "C1.2", offset: { x: 0, y: -1 }, side: "y-" },
      "C2.1": { pinId: "C2.1", offset: { x: 0, y: 1 }, side: "y+" },
      "C2.2": { pinId: "C2.2", offset: { x: 0, y: -1 }, side: "y-" },
      "C3.1": { pinId: "C3.1", offset: { x: 0, y: 1 }, side: "y+" },
      "C3.2": { pinId: "C3.2", offset: { x: 0, y: -1 }, side: "y-" },
    },
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 1,
    partitionGap: 2,
    decouplingCapsGap: 0.5,
    partitionType: "decoupling_caps",
    isPartition: true,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements

  expect(placements["C1"]!.x).toBeCloseTo(-1.5)
  expect(placements["C2"]!.x).toBeCloseTo(0)
  expect(placements["C3"]!.x).toBeCloseTo(1.5)

  expect(placements["C1"]!.y).toBe(0)
  expect(placements["C2"]!.y).toBe(0)
  expect(placements["C3"]!.y).toBe(0)
})
