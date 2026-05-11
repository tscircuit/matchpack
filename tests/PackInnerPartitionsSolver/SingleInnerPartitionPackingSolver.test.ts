import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type {
  Chip,
  ChipId,
  PartitionInputProblem,
} from "lib/types/InputProblem"

const makeChip = (
  chipId: ChipId,
  size: Chip["size"],
  availableRotations: Chip["availableRotations"] = [0, 180],
): Chip => ({
  chipId,
  pins: [],
  size,
  availableRotations,
})

test("SingleInnerPartitionPackingSolver lays decoupling caps out in a centered natural-order row", () => {
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      C10: makeChip("C10", { x: 1, y: 0.5 }),
      C2: makeChip("C2", { x: 2, y: 0.5 }),
      C1: makeChip("C1", { x: 1, y: 0.5 }),
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 1,
    partitionGap: 1,
    decouplingCapsGap: 0.25,
    isPartition: true,
    partitionType: "decoupling_caps",
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout?.chipPlacements.C1?.x).toBeCloseTo(-1.75)
  expect(solver.layout?.chipPlacements.C2?.x).toBeCloseTo(0)
  expect(solver.layout?.chipPlacements.C10?.x).toBeCloseTo(1.75)
  expect(solver.layout?.chipPlacements.C1?.y).toBe(0)
  expect(solver.layout?.chipPlacements.C2?.y).toBe(0)
  expect(solver.layout?.chipPlacements.C10?.y).toBe(0)
})

test("SingleInnerPartitionPackingSolver uses rotated width for fixed rotated decoupling caps", () => {
  const partitionInputProblem: PartitionInputProblem = {
    chipMap: {
      C1: makeChip("C1", { x: 1, y: 3 }, [90]),
      C2: makeChip("C2", { x: 1, y: 3 }, [90]),
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.5,
    partitionGap: 1,
    isPartition: true,
    partitionType: "decoupling_caps",
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout?.chipPlacements.C1?.ccwRotationDegrees).toBe(90)
  expect(solver.layout?.chipPlacements.C2?.ccwRotationDegrees).toBe(90)
  expect(solver.layout?.chipPlacements.C1?.x).toBeCloseTo(-1.75)
  expect(solver.layout?.chipPlacements.C2?.x).toBeCloseTo(1.75)
})
