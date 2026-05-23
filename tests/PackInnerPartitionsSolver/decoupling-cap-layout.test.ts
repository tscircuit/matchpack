import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"

const getDecouplingCapProblem = (): PartitionInputProblem => ({
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.1", "C10.2"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0, 180],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0, 180],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.6, y: 0.5 },
      availableRotations: [0, 180],
    },
  },
  chipPinMap: {
    "C1.1": { pinId: "C1.1", offset: { x: -0.7, y: 0 }, side: "x-" },
    "C1.2": { pinId: "C1.2", offset: { x: 0.7, y: 0 }, side: "x+" },
    "C2.1": { pinId: "C2.1", offset: { x: -0.3, y: 0 }, side: "x-" },
    "C2.2": { pinId: "C2.2", offset: { x: 0.3, y: 0 }, side: "x+" },
    "C10.1": { pinId: "C10.1", offset: { x: -0.5, y: 0 }, side: "x-" },
    "C10.2": { pinId: "C10.2", offset: { x: 0.5, y: 0 }, side: "x+" },
  },
  netMap: {
    GND: { netId: "GND", isGround: true },
    V3_3: { netId: "V3_3", isPositiveVoltageSource: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "C1.1-V3_3": true,
    "C1.2-GND": true,
    "C2.1-V3_3": true,
    "C2.2-GND": true,
    "C10.1-V3_3": true,
    "C10.2-GND": true,
  },
  chipGap: 0.1,
  partitionGap: 1,
  decouplingCapsGap: 0.2,
  isPartition: true,
  partitionType: "decoupling_caps",
})

test("decoupling-cap partitions are laid out as a deterministic centered row", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: getDecouplingCapProblem(),
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.activeSubSolver).toBeUndefined()

  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements).sort()).toEqual(["C1", "C10", "C2"])

  const orderedByX = Object.entries(placements)
    .sort(([, a], [, b]) => a.x - b.x)
    .map(([chipId]) => chipId)
  expect(orderedByX).toEqual(["C1", "C2", "C10"])

  expect(placements.C1!.y).toBe(0)
  expect(placements.C2!.y).toBe(0)
  expect(placements.C10!.y).toBe(0)
  expect(placements.C1!.ccwRotationDegrees).toBe(0)
  expect(placements.C2!.ccwRotationDegrees).toBe(0)
  expect(placements.C10!.ccwRotationDegrees).toBe(0)

  const c1Right = placements.C1!.x + 0.75
  const c2Left = placements.C2!.x - 0.35
  const c2Right = placements.C2!.x + 0.35
  const c10Left = placements.C10!.x - 0.55
  expect(c2Left - c1Right).toBeCloseTo(0.2)
  expect(c10Left - c2Right).toBeCloseTo(0.2)

  const rowMinX = placements.C1!.x - 0.75
  const rowMaxX = placements.C10!.x + 0.55
  expect(rowMinX).toBeCloseTo(-rowMaxX)
})

test("decoupling-cap layout handles an empty partition", () => {
  const problem = getDecouplingCapProblem()
  problem.chipMap = {}
  problem.chipPinMap = {}
  problem.netConnMap = {}

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).toEqual({ chipPlacements: {}, groupPlacements: {} })
})
