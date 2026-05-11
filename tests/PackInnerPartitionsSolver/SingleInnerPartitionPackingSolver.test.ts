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

const createDecapPartition = (
  chipMap: PartitionInputProblem["chipMap"],
  extra: Partial<PartitionInputProblem> = {},
): PartitionInputProblem => ({
  chipMap,
  chipPinMap: {},
  netMap: {},
  pinStrongConnMap: {},
  netConnMap: {},
  chipGap: 1,
  partitionGap: 1,
  isPartition: true,
  partitionType: "decoupling_caps",
  ...extra,
})

const solvePartition = (partitionInputProblem: PartitionInputProblem) => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  return solver.layout!
}

test("SingleInnerPartitionPackingSolver lays decoupling caps out in a centered natural-order row", () => {
  const layout = solvePartition(
    createDecapPartition(
      {
        C10: makeChip("C10", { x: 1, y: 0.5 }),
        C2: makeChip("C2", { x: 2, y: 0.5 }),
        C1: makeChip("C1", { x: 1, y: 0.5 }),
      },
      { decouplingCapsGap: 0.25 },
    ),
  )

  expect(layout.chipPlacements.C1?.x).toBeCloseTo(-1.75)
  expect(layout.chipPlacements.C2?.x).toBeCloseTo(0)
  expect(layout.chipPlacements.C10?.x).toBeCloseTo(1.75)
  expect(layout.chipPlacements.C1?.y).toBe(0)
  expect(layout.chipPlacements.C2?.y).toBe(0)
  expect(layout.chipPlacements.C10?.y).toBe(0)
})

test("SingleInnerPartitionPackingSolver falls back to chipGap for decoupling cap row spacing", () => {
  const layout = solvePartition(
    createDecapPartition({
      C1: makeChip("C1", { x: 1, y: 0.5 }),
      C2: makeChip("C2", { x: 1, y: 0.5 }),
    }),
  )

  expect(layout.chipPlacements.C1?.x).toBeCloseTo(-1)
  expect(layout.chipPlacements.C2?.x).toBeCloseTo(1)
})

test("SingleInnerPartitionPackingSolver uses rotated width for fixed rotated decoupling caps", () => {
  const layout = solvePartition(
    createDecapPartition(
      {
        C1: makeChip("C1", { x: 1, y: 3 }, [90]),
        C2: makeChip("C2", { x: 1, y: 3 }, [90]),
      },
      { chipGap: 0.5 },
    ),
  )

  expect(layout.chipPlacements.C1?.ccwRotationDegrees).toBe(90)
  expect(layout.chipPlacements.C2?.ccwRotationDegrees).toBe(90)
  expect(layout.chipPlacements.C1?.x).toBeCloseTo(-1.75)
  expect(layout.chipPlacements.C2?.x).toBeCloseTo(1.75)
})
