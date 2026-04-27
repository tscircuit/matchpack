import { describe, expect, test } from "bun:test"
import { DecouplingCapsHorizontalRowSolver } from "../../lib/solvers/DecouplingCapsHorizontalRowSolver/DecouplingCapsHorizontalRowSolver"
import type {
  Chip,
  ChipPin,
  PartitionInputProblem,
} from "../../lib/types/InputProblem"
import { normalizeSide } from "../../lib/types/Side"

const makeCap = (
  chipId: string,
  size: { x: number; y: number } = { x: 0.5, y: 1.0 },
): Chip => ({
  chipId,
  pins: [`${chipId}_top`, `${chipId}_bot`],
  size,
  isDecouplingCap: true,
  availableRotations: [0],
})

const makeCapPin = (chipId: string, suffix: "top" | "bot"): ChipPin => ({
  pinId: `${chipId}_${suffix}`,
  offset: { x: 0, y: suffix === "top" ? 0.5 : -0.5 },
  side: suffix === "top" ? normalizeSide("top") : normalizeSide("bottom"),
})

const makePartition = (
  chips: Chip[],
  overrides: Partial<PartitionInputProblem> = {},
): PartitionInputProblem => {
  const chipMap: Record<string, Chip> = {}
  const chipPinMap: Record<string, ChipPin> = {}
  for (const chip of chips) {
    chipMap[chip.chipId] = chip
    chipPinMap[`${chip.chipId}_top`] = makeCapPin(chip.chipId, "top")
    chipPinMap[`${chip.chipId}_bot`] = makeCapPin(chip.chipId, "bot")
  }
  return {
    chipMap,
    chipPinMap,
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 1.0,
    decouplingCapsGap: 0.1,
    isPartition: true,
    partitionType: "decoupling_caps",
    ...overrides,
  }
}

describe("DecouplingCapsHorizontalRowSolver", () => {
  test("empty partition solves immediately with no packed components", () => {
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition([]),
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(solver.packedComponents).toEqual([])
  })

  test("single cap is centered on the origin", () => {
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition([makeCap("C1", { x: 0.5, y: 1.0 })]),
    })
    solver.solve()
    expect(solver.packedComponents).toHaveLength(1)
    expect(solver.packedComponents[0]!.componentId).toBe("C1")
    expect(solver.packedComponents[0]!.center.x).toBeCloseTo(0, 9)
    expect(solver.packedComponents[0]!.center.y).toBe(0)
  })

  test("multiple caps form a horizontal row centered on the origin", () => {
    const caps = [makeCap("C1"), makeCap("C2"), makeCap("C3"), makeCap("C4")]
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition(caps, { decouplingCapsGap: 0.1 }),
    })
    solver.solve()
    const packed = solver.packedComponents
    expect(packed).toHaveLength(4)

    // Caps in chipId order
    expect(packed.map((p) => p.componentId)).toEqual(["C1", "C2", "C3", "C4"])

    // All on y=0
    for (const p of packed) {
      expect(p.center.y).toBe(0)
    }

    // Equal x spacing between adjacent centers (cap width 0.5, gap 0.1 → 0.6)
    const spacings: number[] = []
    for (let i = 1; i < packed.length; i++) {
      spacings.push(packed[i]!.center.x - packed[i - 1]!.center.x)
    }
    for (const s of spacings) {
      expect(s).toBeCloseTo(0.6, 9)
    }

    // Row is centered: leftmost and rightmost centers should mirror around 0
    expect(packed[0]!.center.x).toBeCloseTo(
      -packed[packed.length - 1]!.center.x,
      9,
    )
  })

  test("custom gap parameter overrides decouplingCapsGap and chipGap fallbacks", () => {
    const partition = makePartition([makeCap("C1"), makeCap("C2")], {
      decouplingCapsGap: 5,
      chipGap: 10,
    })
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: partition,
      gap: 0.5,
    })
    solver.solve()
    // With cap width 0.5 and gap 0.5, adjacent centers are 1.0 apart.
    expect(
      solver.packedComponents[1]!.center.x -
        solver.packedComponents[0]!.center.x,
    ).toBeCloseTo(1.0, 9)
  })

  test("falls back to decouplingCapsGap when gap is unset", () => {
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition([makeCap("C1"), makeCap("C2")], {
        decouplingCapsGap: 0.3,
      }),
    })
    solver.solve()
    expect(
      solver.packedComponents[1]!.center.x -
        solver.packedComponents[0]!.center.x,
    ).toBeCloseTo(0.8, 9) // 0.5 (width) + 0.3 (gap)
  })

  test("falls back to chipGap when decouplingCapsGap is missing", () => {
    const partition = makePartition([makeCap("C1"), makeCap("C2")], {
      chipGap: 0.4,
    })
    delete (partition as { decouplingCapsGap?: number }).decouplingCapsGap
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: partition,
    })
    solver.solve()
    expect(
      solver.packedComponents[1]!.center.x -
        solver.packedComponents[0]!.center.x,
    ).toBeCloseTo(0.9, 9) // 0.5 (width) + 0.4 (gap)
  })

  test("non-uniform cap widths still produce a centered, gap-correct row", () => {
    const caps = [
      makeCap("C1", { x: 0.5, y: 1.0 }),
      makeCap("C2", { x: 1.0, y: 1.0 }),
      makeCap("C3", { x: 0.5, y: 1.0 }),
    ]
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition(caps, {
        decouplingCapsGap: 0.1,
      }),
    })
    solver.solve()
    const packed = solver.packedComponents
    // Total width = 0.5 + 1.0 + 0.5 + 2 * 0.1 = 2.2
    // Leftmost center at -1.1 + 0.5/2 = -0.85
    expect(packed[0]!.center.x).toBeCloseTo(-0.85, 9)
    // C2 center at -0.85 + 0.25 + 0.1 + 0.5 = -0.0
    expect(packed[1]!.center.x).toBeCloseTo(0, 9)
    // C3 center at 0 + 0.5 + 0.1 + 0.25 = 0.85
    expect(packed[2]!.center.x).toBeCloseTo(0.85, 9)
  })

  test("ordering is deterministic via lexicographic chipId sort", () => {
    // Insert in non-alphabetical order; output should still be sorted.
    const caps = [makeCap("C10"), makeCap("C2"), makeCap("C1")]
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition(caps),
    })
    solver.solve()
    expect(solver.packedComponents.map((p) => p.componentId)).toEqual([
      "C1",
      "C10",
      "C2",
    ])
  })

  test("rotation is taken from the first availableRotation, defaulting to 0", () => {
    const c1 = makeCap("C1")
    const c2 = makeCap("C2")
    c2.availableRotations = undefined
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition([c1, c2]),
    })
    solver.solve()
    expect(solver.packedComponents[0]!.ccwRotationDegrees).toBe(0)
    expect(solver.packedComponents[1]!.ccwRotationDegrees).toBe(0)
  })

  test("packedComponents shape is assignment-compatible with PackSolver2 consumers", () => {
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition([makeCap("C1")]),
    })
    solver.solve()
    const pc = solver.packedComponents[0]!
    expect(pc.componentId).toBeTypeOf("string")
    expect(pc.center.x).toBeTypeOf("number")
    expect(pc.center.y).toBeTypeOf("number")
    expect(pc.ccwRotationDegrees).toBeTypeOf("number")
  })

  test("solver completes in a single step regardless of cap count", () => {
    const caps = Array.from({ length: 50 }, (_, i) =>
      makeCap(`C${String(i).padStart(3, "0")}`),
    )
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition(caps),
    })
    solver.step()
    expect(solver.solved).toBe(true)
    expect(solver.iterations).toBe(1)
  })

  test("re-running solver produces identical output (idempotent)", () => {
    const caps = [makeCap("C1"), makeCap("C2"), makeCap("C3")]
    const a = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition(caps),
    })
    const b = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition(caps),
    })
    a.solve()
    b.solve()
    expect(b.packedComponents).toEqual(a.packedComponents)
  })

  test("visualize returns rects for every packed cap, with size from chipMap", () => {
    const caps = [
      makeCap("C1", { x: 0.5, y: 1.0 }),
      makeCap("C2", { x: 0.5, y: 1.0 }),
    ]
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: makePartition(caps),
    })
    solver.solve()
    const viz = solver.visualize()
    expect(viz.rects).toHaveLength(2)
    expect(viz.rects?.[0]?.width).toBeCloseTo(0.5, 9)
    expect(viz.rects?.[0]?.height).toBeCloseTo(1.0, 9)
  })

  test("getConstructorParams round-trips so the BaseSolver pipeline can re-run a phase", () => {
    const partition = makePartition([makeCap("C1")])
    const solver = new DecouplingCapsHorizontalRowSolver({
      partitionInputProblem: partition,
      gap: 0.3,
    })
    const [params] = solver.getConstructorParams()
    expect(params.partitionInputProblem).toBe(partition)
    expect(params.gap).toBe(0.3)
  })
})
