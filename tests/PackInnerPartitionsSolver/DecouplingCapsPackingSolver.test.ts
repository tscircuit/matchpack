import { expect, test } from "bun:test"
import { DecouplingCapsPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/DecouplingCapsPackingSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"

/** Build a minimal decoupling-cap partition with N identical caps */
function makeDecapPartition(
  capCount: number,
  capSize = { x: 0.53, y: 1.06 },
  gap = 0.1,
): PartitionInputProblem {
  const chipMap: PartitionInputProblem["chipMap"] = {}
  const chipPinMap: PartitionInputProblem["chipPinMap"] = {}
  const netMap: PartitionInputProblem["netMap"] = {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  }
  const netConnMap: PartitionInputProblem["netConnMap"] = {}
  const pinStrongConnMap: PartitionInputProblem["pinStrongConnMap"] = {}

  for (let i = 0; i < capCount; i++) {
    const chipId = `C${i + 1}`
    const p1 = `${chipId}.1`
    const p2 = `${chipId}.2`
    chipMap[chipId] = {
      chipId,
      pins: [p1, p2],
      size: capSize,
      availableRotations: [0, 180],
    }
    chipPinMap[p1] = {
      pinId: p1,
      offset: { x: 0, y: capSize.y / 2 },
      side: "y+",
    }
    chipPinMap[p2] = {
      pinId: p2,
      offset: { x: 0, y: -capSize.y / 2 },
      side: "y-",
    }
    netConnMap[`${p1}-VCC`] = true
    netConnMap[`${p2}-GND`] = true
  }

  return {
    chipMap,
    chipPinMap,
    netMap,
    pinStrongConnMap,
    netConnMap,
    chipGap: gap,
    partitionGap: 2,
    isPartition: true,
    partitionType: "decoupling_caps",
  }
}

test("DecouplingCapsPackingSolver: single cap placed at origin", () => {
  const partition = makeDecapPartition(1)
  const solver = new DecouplingCapsPackingSolver(partition)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  const layout = solver.layout!
  expect(layout.chipPlacements["C1"]).toBeDefined()

  const { x, y, ccwRotationDegrees } = layout.chipPlacements["C1"]!
  expect(x).toBeCloseTo(0)
  expect(y).toBeCloseTo(0)
  expect(ccwRotationDegrees).toBe(0)
})

test("DecouplingCapsPackingSolver: three caps placed in a horizontal row", () => {
  const capSize = { x: 0.53, y: 1.06 }
  const gap = 0.1
  const partition = makeDecapPartition(3, capSize, gap)
  const solver = new DecouplingCapsPackingSolver(partition)
  solver.solve()

  expect(solver.solved).toBe(true)
  const layout = solver.layout!

  // All three chips must have placements
  expect(layout.chipPlacements["C1"]).toBeDefined()
  expect(layout.chipPlacements["C2"]).toBeDefined()
  expect(layout.chipPlacements["C3"]).toBeDefined()

  const x1 = layout.chipPlacements["C1"]!.x
  const x2 = layout.chipPlacements["C2"]!.x
  const x3 = layout.chipPlacements["C3"]!.x

  // Caps should be sorted and evenly spaced in x
  expect(x1).toBeLessThan(x2)
  expect(x2).toBeLessThan(x3)

  const expectedStep = capSize.x + gap
  expect(x2 - x1).toBeCloseTo(expectedStep, 5)
  expect(x3 - x2).toBeCloseTo(expectedStep, 5)

  // All caps should sit on the same y baseline
  expect(layout.chipPlacements["C1"]!.y).toBeCloseTo(0)
  expect(layout.chipPlacements["C2"]!.y).toBeCloseTo(0)
  expect(layout.chipPlacements["C3"]!.y).toBeCloseTo(0)

  // All at rotation 0
  for (const id of ["C1", "C2", "C3"]) {
    expect(layout.chipPlacements[id]!.ccwRotationDegrees).toBe(0)
  }
})

test("DecouplingCapsPackingSolver: row is centered at x=0", () => {
  const capSize = { x: 1.0, y: 2.0 }
  const gap = 0.2
  const partition = makeDecapPartition(4, capSize, gap)
  const solver = new DecouplingCapsPackingSolver(partition)
  solver.solve()

  expect(solver.solved).toBe(true)
  const layout = solver.layout!

  const xs = ["C1", "C2", "C3", "C4"].map((id) => layout.chipPlacements[id]!.x)
  const centerX = xs.reduce((s, x) => s + x, 0) / xs.length
  // The row center should be very close to 0
  expect(centerX).toBeCloseTo(0, 4)
})

test("DecouplingCapsPackingSolver: respects decouplingCapsGap over chipGap", () => {
  const capSize = { x: 0.53, y: 1.06 }
  const partition = makeDecapPartition(2, capSize)
  partition.chipGap = 0.5
  partition.decouplingCapsGap = 0.05
  const solver = new DecouplingCapsPackingSolver(partition)
  solver.solve()

  expect(solver.solved).toBe(true)
  const layout = solver.layout!

  const x1 = layout.chipPlacements["C1"]!.x
  const x2 = layout.chipPlacements["C2"]!.x
  const expectedStep = capSize.x + 0.05
  expect(x2 - x1).toBeCloseTo(expectedStep, 5)
})

test("DecouplingCapsPackingSolver: visualize returns rects for each cap", () => {
  const partition = makeDecapPartition(3)
  const solver = new DecouplingCapsPackingSolver(partition)
  solver.solve()

  const viz = solver.visualize()
  expect(viz).toBeDefined()
  expect(viz.rects).toBeDefined()
  // Expect at least 3 rects (one per chip)
  expect(viz.rects!.length).toBeGreaterThanOrEqual(3)
})
