import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

const createDecouplingCapPartition = (): PartitionInputProblem => ({
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.1", "C10.2"],
      size: { x: 0.55, y: 0.32 },
      availableRotations: [0, 180],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.45, y: 0.28 },
      availableRotations: [0, 180],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.5, y: 0.3 },
      availableRotations: [0, 180],
    },
  },
  chipPinMap: {
    "C10.1": { pinId: "C10.1", offset: { x: 0, y: -0.16 }, side: "y-" },
    "C10.2": { pinId: "C10.2", offset: { x: 0, y: 0.16 }, side: "y+" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: -0.14 }, side: "y-" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: 0.14 }, side: "y+" },
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: -0.15 }, side: "y-" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: 0.15 }, side: "y+" },
  },
  netMap: {
    GND: { netId: "GND", isGround: true },
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "C10.1-GND": true,
    "C10.2-VCC": true,
    "C2.1-GND": true,
    "C2.2-VCC": true,
    "C1.1-GND": true,
    "C1.2-VCC": true,
  },
  chipGap: 0.1,
  partitionGap: 1,
  decouplingCapsGap: 0.25,
  isPartition: true,
  partitionType: "decoupling_caps",
})

test("SingleInnerPartitionPackingSolver lays decoupling caps out in a deterministic non-overlapping row", () => {
  const partitionInputProblem = createDecouplingCapPartition()
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements
  const orderedChipIds = Object.entries(placements)
    .sort(([, a], [, b]) => a.x - b.x)
    .map(([chipId]) => chipId)

  expect(orderedChipIds).toEqual(["C1", "C2", "C10"])

  for (const placement of Object.values(placements)) {
    expect(placement.y).toBe(0)
    expect(placement.ccwRotationDegrees).toBe(0)
  }

  for (let i = 0; i < orderedChipIds.length - 1; i++) {
    const leftChipId = orderedChipIds[i]!
    const rightChipId = orderedChipIds[i + 1]!
    const leftChip = partitionInputProblem.chipMap[leftChipId]!
    const rightChip = partitionInputProblem.chipMap[rightChipId]!
    const leftPlacement = placements[leftChipId]!
    const rightPlacement = placements[rightChipId]!
    const edgeGap =
      rightPlacement.x -
      rightChip.size.x / 2 -
      (leftPlacement.x + leftChip.size.x / 2)

    expect(edgeGap).toBeCloseTo(partitionInputProblem.decouplingCapsGap!, 6)
  }
})
