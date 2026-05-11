import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

function createDecouplingCapsPartition(): PartitionInputProblem {
  return {
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.8, y: 0.4 },
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 1.2, y: 0.4 },
        availableRotations: [0, 180],
      },
      C10: {
        chipId: "C10",
        pins: ["C10.1", "C10.2"],
        size: { x: 1, y: 0.4 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0, y: -0.2 }, side: "y-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0, y: 0.2 }, side: "y+" },
      "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.2 }, side: "y+" },
      "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.2 }, side: "y-" },
      "C10.1": { pinId: "C10.1", offset: { x: 0, y: 0.2 }, side: "y+" },
      "C10.2": { pinId: "C10.2", offset: { x: 0, y: -0.2 }, side: "y-" },
    },
    netMap: {
      GND: { netId: "GND", isGround: true },
      VDD: { netId: "VDD", isPositiveVoltageSource: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-VDD": true,
      "C1.2-GND": true,
      "C2.1-VDD": true,
      "C2.2-GND": true,
      "C10.1-VDD": true,
      "C10.2-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 1,
    decouplingCapsGap: 0.3,
    isPartition: true,
    partitionType: "decoupling_caps",
  }
}

test("SingleInnerPartitionPackingSolver centers decoupling caps in a deterministic row", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: createDecouplingCapsPartition(),
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.activeSubSolver).toBeUndefined()
  expect(Object.keys(solver.layout!.chipPlacements)).toEqual([
    "C1",
    "C2",
    "C10",
  ])
  expect(solver.layout!.chipPlacements.C1!.x).toBeCloseTo(-1.4)
  expect(solver.layout!.chipPlacements.C2!.x).toBeCloseTo(-0.1)
  expect(solver.layout!.chipPlacements.C10!.x).toBeCloseTo(1.3)
  expect(solver.layout!.chipPlacements.C1!.y).toBe(0)
  expect(solver.layout!.chipPlacements.C2!.y).toBe(0)
  expect(solver.layout!.chipPlacements.C10!.y).toBe(0)
})

test("SingleInnerPartitionPackingSolver rotates caps so positive voltage pins face y+", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: createDecouplingCapsPartition(),
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.layout!.chipPlacements.C1!.ccwRotationDegrees).toBe(180)
  expect(solver.layout!.chipPlacements.C2!.ccwRotationDegrees).toBe(0)
  expect(solver.layout!.chipPlacements.C10!.ccwRotationDegrees).toBe(0)
})
