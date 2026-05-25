import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

/**
 * Regression test for tscircuit/matchpack#15 - Specialized Layout for
 * Decoupling Capacitors.
 *
 * For partitions tagged `decoupling_caps`, the solver should:
 *
 *   1. Lay caps out in a horizontal row, centered around x=0
 *   2. Pick each cap's rotation so the pin connected to the positive-voltage
 *      net consistently faces the same direction across the row (i.e. all
 *      VCC pins up, or all VCC pins down — never mixed within one row)
 *   3. Use the configured `decouplingCapsGap` for spacing
 */

const baseProblem = (): PartitionInputProblem => ({
  chipMap: {},
  chipPinMap: {},
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {},
  netConnMap: {},
  chipGap: 0.1,
  partitionGap: 0.2,
  decouplingCapsGap: 0.3,
  isPartition: true,
  partitionType: "decoupling_caps",
})

test("decoupling-caps partition lays caps in a centered horizontal row", () => {
  const problem = baseProblem()
  problem.chipMap = {
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.5, y: 1.0 },
      isDecouplingCap: true,
      availableRotations: [0, 180],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.5, y: 1.0 },
      isDecouplingCap: true,
      availableRotations: [0, 180],
    },
    C3: {
      chipId: "C3",
      pins: ["C3.1", "C3.2"],
      size: { x: 0.5, y: 1.0 },
      isDecouplingCap: true,
      availableRotations: [0, 180],
    },
  }
  // C1 and C3 have VCC on y+ (top). C2 has VCC on y- (bottom).
  // The solver should rotate C2 by 180° so all VCC pins face y+.
  problem.chipPinMap = {
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.5 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.5 }, side: "y-" },
    "C3.1": { pinId: "C3.1", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C3.2": { pinId: "C3.2", offset: { x: 0, y: -0.5 }, side: "y-" },
  }
  problem.netConnMap = {
    "C1.1-VCC": true,
    "C1.2-GND": true,
    "C2.2-VCC": true, // C2 wired backwards — VCC on bottom pin
    "C2.1-GND": true,
    "C3.1-VCC": true,
    "C3.2-GND": true,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).not.toBeNull()
  const placements = solver.layout!.chipPlacements

  // All three caps placed
  expect(Object.keys(placements).sort()).toEqual(["C1", "C2", "C3"])

  // All at y=0 (linear row)
  expect(placements.C1!.y).toBe(0)
  expect(placements.C2!.y).toBe(0)
  expect(placements.C3!.y).toBe(0)

  // Row is centered: leftmost x and rightmost x are symmetric around 0
  const xs = [placements.C1!.x, placements.C2!.x, placements.C3!.x].sort(
    (a, b) => a - b,
  )
  expect(xs[0]! + xs[2]!).toBeCloseTo(0, 5)

  // Consistent gap (size 0.5 + gap 0.3 = 0.8 between centers)
  expect(xs[1]! - xs[0]!).toBeCloseTo(0.8, 5)
  expect(xs[2]! - xs[1]!).toBeCloseTo(0.8, 5)

  // C1 and C3 keep their natural rotation (VCC already on y+).
  expect(placements.C1!.ccwRotationDegrees).toBe(0)
  expect(placements.C3!.ccwRotationDegrees).toBe(0)

  // C2 is flipped 180° to align its VCC pin to y+.
  expect(placements.C2!.ccwRotationDegrees).toBe(180)
})

test("decoupling-caps with no positive-voltage pin info falls back to first available rotation", () => {
  const problem = baseProblem()
  // Strip the voltage-source flag so we have no orientation signal.
  problem.netMap = {
    NET_A: { netId: "NET_A" },
    NET_B: { netId: "NET_B" },
  }
  problem.chipMap = {
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.5, y: 1.0 },
      availableRotations: [0, 180],
    },
  }
  problem.chipPinMap = {
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.5 }, side: "y-" },
  }
  problem.netConnMap = {
    "C1.1-NET_A": true,
    "C1.2-NET_B": true,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout!.chipPlacements.C1!.ccwRotationDegrees).toBe(0)
})
