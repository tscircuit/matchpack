import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type {
  Chip,
  ChipId,
  PartitionInputProblem,
} from "../../lib/types/InputProblem"
import type { OutputLayout } from "../../lib/types/OutputLayout"

const makeCap = (
  chipId: ChipId,
  size: { x: number; y: number },
  availableRotations: Chip["availableRotations"] = [0, 180],
): Chip => ({
  chipId,
  pins: [],
  size,
  isDecouplingCap: true,
  availableRotations,
})

const makeDecouplingCapsPartition = (
  chipMap: Record<ChipId, Chip>,
  decouplingCapsGap = 0.4,
): PartitionInputProblem => ({
  chipMap,
  chipPinMap: {},
  netMap: {},
  pinStrongConnMap: {},
  netConnMap: {},
  chipGap: 0.2,
  partitionGap: 2,
  decouplingCapsGap,
  isPartition: true,
  partitionType: "decoupling_caps",
})

const getBounds = (
  inputProblem: PartitionInputProblem,
  layout: OutputLayout,
  chipId: ChipId,
) => {
  const chip = inputProblem.chipMap[chipId]!
  const placement = layout.chipPlacements[chipId]!
  const rotation = placement.ccwRotationDegrees % 180
  const width = rotation === 90 ? chip.size.y : chip.size.x
  const height = rotation === 90 ? chip.size.x : chip.size.y

  return {
    left: placement.x - width / 2,
    right: placement.x + width / 2,
    top: placement.y + height / 2,
    bottom: placement.y - height / 2,
  }
}

test("SingleInnerPartitionPackingSolver packs decoupling caps into a deterministic row", () => {
  const inputProblem = makeDecouplingCapsPartition({
    C10: makeCap("C10", { x: 0.75, y: 1 }),
    C1: makeCap("C1", { x: 0.5, y: 1 }),
    C2: makeCap("C2", { x: 1, y: 1 }),
  })
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: inputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).not.toBeNull()
  expect(Object.keys(solver.layout!.chipPlacements)).toEqual([
    "C1",
    "C2",
    "C10",
  ])
  expect(solver.layout!.chipPlacements.C1!.x).toBeCloseTo(-1.275, 6)
  expect(solver.layout!.chipPlacements.C2!.x).toBeCloseTo(-0.125, 6)
  expect(solver.layout!.chipPlacements.C10!.x).toBeCloseTo(1.15, 6)
  expect(solver.layout!.chipPlacements.C1!.y).toBe(0)
  expect(solver.layout!.chipPlacements.C2!.y).toBe(0)
  expect(solver.layout!.chipPlacements.C10!.y).toBe(0)

  const c1Bounds = getBounds(inputProblem, solver.layout!, "C1")
  const c2Bounds = getBounds(inputProblem, solver.layout!, "C2")
  const c10Bounds = getBounds(inputProblem, solver.layout!, "C10")

  expect(c2Bounds.left - c1Bounds.right).toBeCloseTo(0.4, 6)
  expect(c10Bounds.left - c2Bounds.right).toBeCloseTo(0.4, 6)
})

test("SingleInnerPartitionPackingSolver respects fixed rotated cap dimensions", () => {
  const inputProblem = makeDecouplingCapsPartition(
    {
      C1: makeCap("C1", { x: 1, y: 2 }, [90]),
      C2: makeCap("C2", { x: 1, y: 1 }, [0]),
    },
    0.25,
  )
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: inputProblem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout!.chipPlacements.C1!.ccwRotationDegrees).toBe(90)
  expect(solver.layout!.chipPlacements.C2!.ccwRotationDegrees).toBe(0)
  expect(solver.layout!.chipPlacements.C1!.x).toBeCloseTo(-0.625, 6)
  expect(solver.layout!.chipPlacements.C2!.x).toBeCloseTo(1.125, 6)

  const c1Bounds = getBounds(inputProblem, solver.layout!, "C1")
  const c2Bounds = getBounds(inputProblem, solver.layout!, "C2")

  expect(c2Bounds.left - c1Bounds.right).toBeCloseTo(0.25, 6)
})
