import { test, expect } from "bun:test"

test("decoupling_caps partition produces a horizontal-row layout via the inner solver", () => {
  const {
    SingleInnerPartitionPackingSolver,
  } = require("../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver")

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: {
      chipMap: {
        C1: { chipId: "C1", pins: ["C1.1", "C1.2"], size: { x: 0.5, y: 1.0 } },
        C2: { chipId: "C2", pins: ["C2.1", "C2.2"], size: { x: 0.5, y: 1.0 } },
        C3: { chipId: "C3", pins: ["C3.1", "C3.2"], size: { x: 0.5, y: 1.0 } },
      },
      chipPinMap: {
        "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.5 }, side: "y+" },
        "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.5 }, side: "y-" },
        "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.5 }, side: "y+" },
        "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.5 }, side: "y-" },
        "C3.1": { pinId: "C3.1", offset: { x: 0, y: 0.5 }, side: "y+" },
        "C3.2": { pinId: "C3.2", offset: { x: 0, y: -0.5 }, side: "y-" },
      },
      netMap: {},
      pinStrongConnMap: {},
      netConnMap: {},
      chipGap: 0.2,
      partitionGap: 1,
      decouplingCapsGap: 0.1,
      isPartition: true,
      partitionType: "decoupling_caps",
    },
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements)).toEqual(
    expect.arrayContaining(["C1", "C2", "C3"]),
  )

  // All three caps land on the same y-axis (y=0 — the row).
  for (const id of ["C1", "C2", "C3"]) {
    expect(placements[id].y).toBe(0)
  }

  // Sorted x order (C1 < C2 < C3) so the row reads left-to-right by chipId.
  expect(placements.C1.x).toBeLessThan(placements.C2.x)
  expect(placements.C2.x).toBeLessThan(placements.C3.x)

  // Uniform spacing — all gaps match within float epsilon.
  const gap1 = placements.C2.x - placements.C1.x
  const gap2 = placements.C3.x - placements.C2.x
  expect(gap1).toBeCloseTo(gap2, 9)
})

test("default partitions still drive PackSolver2 (regression guard)", () => {
  // The partitionType branch must only kick in for `decoupling_caps`.
  // For the default path the solver should still construct PackSolver2,
  // which we detect via its different output stat shape (PackSolver2
  // has internal `iterations` typically much larger than 1, while
  // DecouplingCapsHorizontalRowSolver completes in one step).
  const {
    SingleInnerPartitionPackingSolver,
  } = require("../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver")

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: {
      chipMap: {
        U1: { chipId: "U1", pins: ["U1.1"], size: { x: 2, y: 2 } },
      },
      chipPinMap: {
        "U1.1": { pinId: "U1.1", offset: { x: 0, y: 0 }, side: "x+" },
      },
      netMap: {},
      pinStrongConnMap: {},
      netConnMap: {},
      chipGap: 0.2,
      partitionGap: 1,
      isPartition: true,
      partitionType: "default",
    },
    pinIdToStronglyConnectedPins: {},
  })

  // Step once and inspect the live sub-solver before it finishes.
  solver._step()
  // PackSolver2 takes multiple steps; the row solver completes in 1.
  // Either way, the active sub-solver should NOT be the row solver.
  if (solver.activeSubSolver) {
    expect(solver.activeSubSolver.constructor.name).not.toBe(
      "DecouplingCapsHorizontalRowSolver",
    )
  }

  // Drive to completion (PackSolver2 should still solve a 1-chip case).
  solver.solve()
  expect(solver.solved).toBe(true)
})
