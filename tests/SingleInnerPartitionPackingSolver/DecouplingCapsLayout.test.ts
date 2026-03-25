import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

function createDecouplingCapsProblem(
  numCaps: number,
  chipSize = { x: 0.5, y: 0.3 },
): PartitionInputProblem {
  const chipMap: PartitionInputProblem["chipMap"] = {}
  const chipPinMap: PartitionInputProblem["chipPinMap"] = {}

  for (let i = 0; i < numCaps; i++) {
    const chipId = `cap_${i}`
    chipMap[chipId] = {
      chipId,
      pins: [`${chipId}_pin1`, `${chipId}_pin2`],
      size: { ...chipSize },
      isDecouplingCap: true,
    }
    chipPinMap[`${chipId}_pin1`] = {
      pinId: `${chipId}_pin1`,
      offset: { x: -chipSize.x / 2, y: 0 },
      side: "left",
    }
    chipPinMap[`${chipId}_pin2`] = {
      pinId: `${chipId}_pin2`,
      offset: { x: chipSize.x / 2, y: 0 },
      side: "right",
    }
  }

  return {
    chipMap,
    chipPinMap,
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.1,
    partitionGap: 0.2,
    decouplingCapsGap: 0.15,
    partitionType: "decoupling_caps",
  }
}

test("decoupling caps are arranged in a horizontal row", () => {
  const problem = createDecouplingCapsProblem(3)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeTruthy()

  const placements = solver.layout!.chipPlacements
  const caps = Object.keys(placements)
  expect(caps).toHaveLength(3)

  // All caps should be at the same Y (horizontal row)
  const yValues = caps.map((id) => placements[id].y)
  expect(new Set(yValues).size).toBe(1)

  // All caps should have no rotation
  for (const id of caps) {
    expect(placements[id].ccwRotationDegrees).toBe(0)
  }

  // X positions should be monotonically increasing
  const xValues = caps
    .map((id) => placements[id].x)
    .sort((a, b) => a - b)
  for (let i = 1; i < xValues.length; i++) {
    expect(xValues[i]).toBeGreaterThan(xValues[i - 1])
  }
})

test("decoupling caps gap is used for spacing", () => {
  const problem = createDecouplingCapsProblem(2, { x: 0.4, y: 0.2 })
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const placements = solver.layout!.chipPlacements
  const xs = Object.values(placements)
    .map((p) => p.x)
    .sort((a, b) => a - b)

  // Gap between centers should be chipSize.x + decouplingCapsGap = 0.4 + 0.15 = 0.55
  expect(xs[1] - xs[0]).toBeCloseTo(0.55)
})

test("single decoupling cap is placed at origin", () => {
  const problem = createDecouplingCapsProblem(1, { x: 0.5, y: 0.3 })
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const placement = solver.layout!.chipPlacements["cap_0"]
  expect(placement.x).toBeCloseTo(0.25) // chipSize.x / 2
  expect(placement.y).toBeCloseTo(0.15) // chipSize.y / 2
})
