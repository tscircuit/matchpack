import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

test("SingleInnerPartitionPackingSolver lays decoupling caps out in a centered deterministic row", () => {
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      C10: {
        chipId: "C10",
        pins: [],
        size: { x: 2, y: 1 },
        availableRotations: [0],
      },
      C2: {
        chipId: "C2",
        pins: [],
        size: { x: 1, y: 1 },
        availableRotations: [0],
      },
      C1: {
        chipId: "C1",
        pins: [],
        size: { x: 3, y: 1 },
        availableRotations: [0],
      },
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
    decouplingCapsGap: 0.5,
    partitionType: "decoupling_caps",
    isPartition: true,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.activeSubSolver).toBeNull()
  expect(solver.layout?.chipPlacements.C1).toEqual({
    x: -2,
    y: 0,
    ccwRotationDegrees: 0,
  })
  expect(solver.layout?.chipPlacements.C2).toEqual({
    x: 0.5,
    y: 0,
    ccwRotationDegrees: 0,
  })
  expect(solver.layout?.chipPlacements.C10).toEqual({
    x: 2.5,
    y: 0,
    ccwRotationDegrees: 0,
  })
})
