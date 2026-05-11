import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

const makeDecouplingPartition = (
  overrides: Partial<PartitionInputProblem> = {},
): PartitionInputProblem => ({
  chipMap: {
    C10: {
      chipId: "C10",
      pins: [],
      size: { x: 1, y: 0.5 },
      availableRotations: [0, 180],
    },
    C2: {
      chipId: "C2",
      pins: [],
      size: { x: 2, y: 0.5 },
      availableRotations: [0, 180],
    },
    C1: {
      chipId: "C1",
      pins: [],
      size: { x: 1, y: 0.5 },
      availableRotations: [0, 180],
    },
  },
  chipPinMap: {},
  netMap: {},
  pinStrongConnMap: {},
  netConnMap: {},
  chipGap: 0.5,
  partitionGap: 2,
  decouplingCapsGap: 0.25,
  isPartition: true,
  partitionType: "decoupling_caps",
  ...overrides,
})

test("SingleInnerPartitionPackingSolver places decoupling caps in a centered natural-id row", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: makeDecouplingPartition(),
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.activeSubSolver).toBeNull()
  expect(solver.layout?.chipPlacements).toEqual({
    C1: { x: -1.75, y: 0, ccwRotationDegrees: 0 },
    C2: { x: 0, y: 0, ccwRotationDegrees: 0 },
    C10: { x: 1.75, y: 0, ccwRotationDegrees: 0 },
  })
})

test("SingleInnerPartitionPackingSolver falls back to chipGap for decoupling cap row spacing", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: makeDecouplingPartition({
      decouplingCapsGap: undefined,
    }),
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  expect(solver.layout?.chipPlacements.C1?.x).toBe(-2)
  expect(solver.layout?.chipPlacements.C2?.x).toBe(0)
  expect(solver.layout?.chipPlacements.C10?.x).toBe(2)
})
