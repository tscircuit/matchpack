import { describe, expect, test } from "bun:test"
import { DecouplingCapsHorizontalRowSolver } from "../../lib/solvers/DecouplingCapsHorizontalRowSolver/DecouplingCapsHorizontalRowSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"
/** Helper to build a minimal decoupling-cap PartitionInputProblem */
function makePartition(
  chipIds: string[],
  opts: { gap?: number; decouplingCapsGap?: number } = {},
): PartitionInputProblem {
  const chipMap: PartitionInputProblem["chipMap"] = {}
  const chipPinMap: PartitionInputProblem["chipPinMap"] = {}

  for (const id of chipIds) {
    const topPin = `${id}.1`
    const botPin = `${id}.2`
    chipMap[id] = {
      chipId: id,
      pins: [topPin, botPin],
      size: { x: 0.53, y: 1.06 },
      isDecouplingCap: true,
      availableRotations: [0, 180],
    }
    chipPinMap[topPin] = {
      pinId: topPin,
      offset: { x: 0, y: 0.53 },
      side: "y+",
    }
    chipPinMap[botPin] = {
      pinId: botPin,
      offset: { x: 0, y: -0.53 },
      side: "y-",
    }
  }

  return {
    chipMap,
    chipPinMap,
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: opts.gap ?? 0.2,
    partitionGap: 2,
    decouplingCapsGap: opts.decouplingCapsGap,
    isPartition: true,
    partitionType: "decoupling_caps",
  }
}

describe("DecouplingCapsHorizontalRowSolver", () => {
  test("solves successfully and marks solved=true", () => {
    const partition = makePartition(["C1", "C2", "C3"])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
  })

  test("places all capacitors in a row", () => {
    const partition = makePartition(["C1", "C2", "C3"])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    expect(solver.packedComponents).toHaveLength(3)
    expect(solver.layout).toBeDefined()
    expect(Object.keys(solver.layout!.chipPlacements)).toHaveLength(3)
  })

  test("sorts chips by chipId (numeric-aware)", () => {
    // C9, C10 must come out C9 < C10 not C10 < C9 (lexicographic would fail)
    const partition = makePartition(["C10", "C9", "C2"])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    const xPositions = solver.packedComponents.map((c) => ({
      id: c.componentId,
      x: c.center.x,
    }))
    // C2 < C9 < C10 in numeric order → x increases left to right
    const c2 = xPositions.find((p) => p.id === "C2")!
    const c9 = xPositions.find((p) => p.id === "C9")!
    const c10 = xPositions.find((p) => p.id === "C10")!
    expect(c2.x).toBeLessThan(c9.x)
    expect(c9.x).toBeLessThan(c10.x)
  })

  test("all capacitors share the same y coordinate (one row)", () => {
    const partition = makePartition(["C3", "C1", "C2"])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    const ys = solver.packedComponents.map((c) => c.center.y)
    for (const y of ys) {
      expect(y).toBe(0)
    }
  })

  test("row is centered around origin (symmetric)", () => {
    const partition = makePartition(["C1", "C2", "C3"])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    const xs = solver.packedComponents.map((c) => c.center.x)
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    // Mean of a symmetric row should be ~0
    expect(Math.abs(mean)).toBeLessThan(0.001)
  })

  test("uses decouplingCapsGap when provided", () => {
    const gap = 0.05
    const partition = makePartition(["C1", "C2"], {
      decouplingCapsGap: gap,
      gap: 0.5, // chipGap should be ignored
    })
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    const [p1, p2] = solver.packedComponents
      .sort((a, b) => a.center.x - b.center.x)
      .slice(0, 2)

    // Distance between centers = chipWidth + gap = 0.53 + 0.05 = 0.58
    const expectedDist = 0.53 + gap
    expect(p2!.center.x - p1!.center.x).toBeCloseTo(expectedDist, 5)
  })

  test("falls back to chipGap when decouplingCapsGap is absent", () => {
    const chipGap = 0.3
    const partition = makePartition(["C1", "C2"], { gap: chipGap })
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    const [p1, p2] = solver.packedComponents
      .sort((a, b) => a.center.x - b.center.x)
      .slice(0, 2)

    const expectedDist = 0.53 + chipGap
    expect(p2!.center.x - p1!.center.x).toBeCloseTo(expectedDist, 5)
  })

  test("handles single capacitor without error", () => {
    const partition = makePartition(["C1"])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.packedComponents).toHaveLength(1)
    // Single cap should be placed at origin
    expect(solver.packedComponents[0]!.center.x).toBeCloseTo(0)
    expect(solver.packedComponents[0]!.center.y).toBeCloseTo(0)
  })

  test("handles empty partition without error", () => {
    const partition = makePartition([])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.packedComponents).toHaveLength(0)
    expect(solver.layout).toBeDefined()
  })

  test("produces no chip overlaps", () => {
    const partition = makePartition(["C1", "C2", "C3", "C4", "C5"])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    const placements = solver.packedComponents
    const chipWidth = 0.53 // size.x for all caps in this test
    const gap = 0.2 // chipGap

    // Verify no two chips overlap (each must be at least chipWidth apart)
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const dx = Math.abs(placements[i]!.center.x - placements[j]!.center.x)
        // Minimum non-overlapping distance is chipWidth + gap
        expect(dx).toBeGreaterThanOrEqual(chipWidth + gap - 0.001)
      }
    }
  })

  test("uses first availableRotation for each cap", () => {
    const partition = makePartition(["C1", "C2"])
    // availableRotations is [0, 180] → first rotation = 0
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    for (const p of solver.packedComponents) {
      expect(p.ccwRotationDegrees).toBe(0)
    }
  })

  test("layout chipPlacements match packedComponents", () => {
    const partition = makePartition(["C1", "C2", "C3"])
    const solver = new DecouplingCapsHorizontalRowSolver(partition)
    solver.solve()

    for (const p of solver.packedComponents) {
      const placement = solver.layout!.chipPlacements[p.componentId]
      expect(placement).toBeDefined()
      expect(placement!.x).toBeCloseTo(p.center.x, 10)
      expect(placement!.y).toBeCloseTo(p.center.y, 10)
      expect(placement!.ccwRotationDegrees).toBe(p.ccwRotationDegrees ?? 0)
    }
  })
})
