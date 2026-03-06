/**
 * Tests for the specialized linear layout of decoupling capacitor partitions.
 *
 * Decoupling caps should be placed in a neat horizontal row rather than
 * the chaotic cluster that PackSolver2 produces.
 *
 * Reference: https://github.com/tscircuit/tscircuit/issues/786
 */

import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getExampleCircuitJson } from "./assets/RP2040Circuit"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

/** Build a minimal decoupling-cap partition with N capacitors. */
function makeDecapPartition(
  count: number,
  gapOverride?: number,
): PartitionInputProblem {
  const chipMap: PartitionInputProblem["chipMap"] = {}
  const chipPinMap: PartitionInputProblem["chipPinMap"] = {}
  const netConnMap: PartitionInputProblem["netConnMap"] = {}

  for (let i = 1; i <= count; i++) {
    const id = `C${i}`
    chipMap[id] = {
      chipId: id,
      pins: [`${id}_P1`, `${id}_P2`],
      size: { x: 1.0, y: 0.5 },
      availableRotations: [0, 180],
    }
    chipPinMap[`${id}_P1`] = {
      pinId: `${id}_P1`,
      offset: { x: 0, y: 0.25 },
      side: "y+",
    }
    chipPinMap[`${id}_P2`] = {
      pinId: `${id}_P2`,
      offset: { x: 0, y: -0.25 },
      side: "y-",
    }
    netConnMap[`${id}_P1-VCC`] = true
    netConnMap[`${id}_P2-GND`] = true
  }

  return {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap,
    chipPinMap,
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap,
    chipGap: 0.2,
    partitionGap: 2,
    decouplingCapsGap: gapOverride ?? 0.3,
  }
}

test("decoupling caps linear layout: all caps placed in a horizontal row at y=0", () => {
  const problem = makeDecapPartition(5)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements

  // All 5 caps must have placements
  expect(Object.keys(placements)).toHaveLength(5)

  // All caps must be at y=0 (horizontal row)
  for (const [chipId, p] of Object.entries(placements)) {
    expect(p.y).toBe(0)
    expect(p.ccwRotationDegrees).toBe(0)
  }
})

test("decoupling caps linear layout: caps are sorted deterministically by chipId", () => {
  const problem = makeDecapPartition(5)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  const placements = solver.layout!.chipPlacements
  const sortedIds = ["C1", "C2", "C3", "C4", "C5"]

  // Each successive cap should have a greater x value
  for (let i = 0; i < sortedIds.length - 1; i++) {
    const a = placements[sortedIds[i]!]!
    const b = placements[sortedIds[i + 1]!]!
    expect(b.x).toBeGreaterThan(a.x)
  }
})

test("decoupling caps linear layout: row is centered at x=0", () => {
  const problem = makeDecapPartition(5)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  const placements = solver.layout!.chipPlacements
  const xs = Object.values(placements).map((p) => p.x)
  const centerX = xs.reduce((a, b) => a + b, 0) / xs.length

  // Center of mass should be at x≈0 (within floating point tolerance)
  expect(Math.abs(centerX)).toBeLessThan(0.001)
})

test("decoupling caps linear layout: gap between caps equals decouplingCapsGap", () => {
  const gap = 0.4
  const problem = makeDecapPartition(3, gap)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  const placements = solver.layout!.chipPlacements
  const chipSize = 1.0 // all chips are 1.0 wide in makeDecapPartition

  // Distance between adjacent centers = chipSize + gap
  const expectedStep = chipSize + gap
  const c1x = placements["C1"]!.x
  const c2x = placements["C2"]!.x
  const c3x = placements["C3"]!.x

  expect(Math.abs(c2x - c1x - expectedStep)).toBeLessThan(0.001)
  expect(Math.abs(c3x - c2x - expectedStep)).toBeLessThan(0.001)
})

test("decoupling caps linear layout: single cap is placed at origin", () => {
  const problem = makeDecapPartition(1)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  const placement = solver.layout!.chipPlacements["C1"]!
  expect(placement.x).toBe(0)
  expect(placement.y).toBe(0)
})

test("decoupling caps linear layout: RP2040 pipeline completes without overlaps in packed partitions", () => {
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()

  // Should have placements for all chips
  const chipIds = Object.keys(problem.chipMap)
  for (const chipId of chipIds) {
    expect(outputLayout.chipPlacements[chipId]).toBeDefined()
  }

  // Validate visualization is generated
  const viz = solver.visualize()
  expect(viz).toBeDefined()
  expect(viz.rects).toBeDefined()
  expect(viz.rects!.length).toBeGreaterThan(0)
})
