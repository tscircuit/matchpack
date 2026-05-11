import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

function makeDecouplingPartition(
  chips: Record<
    string,
    { size: { x: number; y: number }; rotations?: Array<0 | 90 | 180 | 270> }
  >,
  opts: Partial<PartitionInputProblem> = {},
): PartitionInputProblem {
  const chipMap: PartitionInputProblem["chipMap"] = {}
  for (const [chipId, cfg] of Object.entries(chips)) {
    chipMap[chipId] = {
      chipId,
      pins: [],
      size: cfg.size,
      availableRotations: cfg.rotations ?? [0, 180],
    }
  }
  return {
    chipMap,
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.5,
    partitionGap: 2,
    decouplingCapsGap: 0.25,
    isPartition: true,
    partitionType: "decoupling_caps",
    ...opts,
  }
}

function solve(partition: PartitionInputProblem) {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })
  solver.step()
  return solver
}

test("decoupling caps: chips are placed in a centered horizontal row", () => {
  // Three caps of equal width 1, gap 0.25 → total width = 3 + 2*0.25 = 3.5
  // Centers: -1.375, 0 (−1.375+1+0.25+0.5=0), +1.375 — wait, let's compute:
  // gap=0.25, widths: C1=1, C2=1, C3=1
  // totalWidth = 1 + 1 + 1 + 2*0.25 = 3.5
  // start cursor = -1.75
  // C1 center = -1.75 + 0.5 = -1.25
  // C2 center = -1.25 + 0.5 + 0.25 + 0.5 = -0.0 ... let me just check actual values
  const solver = solve(
    makeDecouplingPartition({
      C1: { size: { x: 1, y: 0.5 } },
      C2: { size: { x: 1, y: 0.5 } },
      C3: { size: { x: 1, y: 0.5 } },
    }),
  )

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.activeSubSolver).toBeNull()

  const placements = solver.layout!.chipPlacements
  // All caps should be on y=0
  for (const [, placement] of Object.entries(placements)) {
    expect(placement.y).toBe(0)
  }

  // Should have exactly 3 placements
  expect(Object.keys(placements)).toHaveLength(3)

  // C1 should be leftmost, C3 rightmost
  expect(placements["C1"]!.x).toBeLessThan(placements["C2"]!.x)
  expect(placements["C2"]!.x).toBeLessThan(placements["C3"]!.x)
})

test("decoupling caps: natural sort orders C1, C2, C10 not C1, C10, C2", () => {
  const solver = solve(
    makeDecouplingPartition({
      C10: { size: { x: 1, y: 0.5 } },
      C2: { size: { x: 2, y: 0.5 } },
      C1: { size: { x: 1, y: 0.5 } },
    }),
  )

  expect(solver.solved).toBe(true)
  const p = solver.layout!.chipPlacements

  // Natural order: C1 < C2 < C10
  expect(p["C1"]!.x).toBeLessThan(p["C2"]!.x)
  expect(p["C2"]!.x).toBeLessThan(p["C10"]!.x)
})

test("decoupling caps: exact positions with decouplingCapsGap", () => {
  // C1: width=1, C2: width=2, C10: width=1; gap=0.25
  // natural order: C1, C2, C10
  // totalWidth = 1 + 2 + 1 + 2*0.25 = 4.5
  // cursor starts at -2.25
  // C1: center=-2.25+0.5=-1.75, cursor=-2.25+1+0.25=-1.0
  // C2: center=-1.0+1=0, cursor=-1.0+2+0.25=1.25
  // C10: center=1.25+0.5=1.75
  const solver = solve(
    makeDecouplingPartition({
      C10: { size: { x: 1, y: 0.5 } },
      C2: { size: { x: 2, y: 0.5 } },
      C1: { size: { x: 1, y: 0.5 } },
    }),
  )

  const p = solver.layout!.chipPlacements
  expect(p["C1"]!).toEqual({ x: -1.75, y: 0, ccwRotationDegrees: 0 })
  expect(p["C2"]!).toEqual({ x: 0, y: 0, ccwRotationDegrees: 0 })
  expect(p["C10"]!).toEqual({ x: 1.75, y: 0, ccwRotationDegrees: 0 })
})

test("decoupling caps: falls back to chipGap when decouplingCapsGap is absent", () => {
  // C1: width=1, C2: width=2, C10: width=1; chipGap=0.5
  // naturalOrder: C1, C2, C10
  // totalWidth = 1 + 2 + 1 + 2*0.5 = 5
  // cursor: -2.5 → C1 at -2.0, C2 at 0.0, C10 at 2.0
  const solver = solve(
    makeDecouplingPartition(
      {
        C10: { size: { x: 1, y: 0.5 } },
        C2: { size: { x: 2, y: 0.5 } },
        C1: { size: { x: 1, y: 0.5 } },
      },
      { decouplingCapsGap: undefined },
    ),
  )

  const p = solver.layout!.chipPlacements
  expect(p["C1"]!.x).toBe(-2)
  expect(p["C2"]!.x).toBe(0)
  expect(p["C10"]!.x).toBe(2)
})

test("decoupling caps: rotation 90/270 swaps width and height for spacing", () => {
  // A cap with size x=0.5, y=1 and rotation=90: effective width = size.y = 1
  const solver = solve(
    makeDecouplingPartition({
      C1: { size: { x: 0.5, y: 1 }, rotations: [90, 270] },
      C2: { size: { x: 0.5, y: 1 }, rotations: [90, 270] },
    }),
  )

  expect(solver.solved).toBe(true)
  const p = solver.layout!.chipPlacements
  // Both should use 90-degree rotation
  expect(p["C1"]!.ccwRotationDegrees).toBe(90)
  expect(p["C2"]!.ccwRotationDegrees).toBe(90)
  // Width used for spacing is size.y=1, gap=0.25
  // total = 1+1+0.25 = 2.25, start=-1.125
  // C1: -1.125+0.5=-0.625, C2: -0.625+1+0.25+0.5=1.125... wait let me recalc
  // Actually C1 center = -1.125 + 1/2 = -0.625
  // cursor after C1 = -1.125 + 1 + 0.25 = 0.125
  // C2 center = 0.125 + 0.5 = 0.625
  expect(p["C1"]!.x).toBe(-0.625)
  expect(p["C2"]!.x).toBe(0.625)
})

test("decoupling caps: PackSolver2 not invoked (activeSubSolver is null)", () => {
  const solver = solve(
    makeDecouplingPartition({
      C1: { size: { x: 1, y: 0.5 } },
      C2: { size: { x: 1, y: 0.5 } },
    }),
  )

  expect(solver.solved).toBe(true)
  // PackSolver2 must not have been created
  expect(solver.activeSubSolver).toBeNull()
})
