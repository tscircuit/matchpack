import { test, expect } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"

/**
 * Minimal problem: one main chip (U1) with 4 decoupling caps (C1-C4),
 * each connecting GND and VCC through the main chip.
 */
const problem: InputProblem = {
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.1", "U1.2", "U1.3", "U1.4", "U1.5", "U1.6", "U1.7", "U1.8"],
      size: { x: 2, y: 4 },
      availableRotations: [0, 90, 180, 270],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0, 180],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0, 180],
    },
    C3: {
      chipId: "C3",
      pins: ["C3.1", "C3.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0, 180],
    },
    C4: {
      chipId: "C4",
      pins: ["C4.1", "C4.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0, 180],
    },
  },
  chipPinMap: {
    "U1.1": { pinId: "U1.1", offset: { x: -1, y: -1.5 }, side: "x-" },
    "U1.2": { pinId: "U1.2", offset: { x: -1, y: -0.5 }, side: "x-" },
    "U1.3": { pinId: "U1.3", offset: { x: -1, y: 0.5 }, side: "x-" },
    "U1.4": { pinId: "U1.4", offset: { x: -1, y: 1.5 }, side: "x-" },
    "U1.5": { pinId: "U1.5", offset: { x: 1, y: -1.5 }, side: "x+" },
    "U1.6": { pinId: "U1.6", offset: { x: 1, y: -0.5 }, side: "x+" },
    "U1.7": { pinId: "U1.7", offset: { x: 1, y: 0.5 }, side: "x+" },
    "U1.8": { pinId: "U1.8", offset: { x: 1, y: 1.5 }, side: "x+" },
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: -0.5 }, side: "y-" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: -0.5 }, side: "y-" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C3.1": { pinId: "C3.1", offset: { x: 0, y: -0.5 }, side: "y-" },
    "C3.2": { pinId: "C3.2", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C4.1": { pinId: "C4.1", offset: { x: 0, y: -0.5 }, side: "y-" },
    "C4.2": { pinId: "C4.2", offset: { x: 0, y: 0.5 }, side: "y+" },
  },
  netMap: {
    GND: { netId: "GND", isGround: true },
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
  },
  pinStrongConnMap: {
    "C1.1-U1.1": true,
    "C2.1-U1.2": true,
    "C3.1-U1.3": true,
    "C4.1-U1.4": true,
  },
  netConnMap: {
    "U1.1-GND": true,
    "U1.2-GND": true,
    "U1.3-GND": true,
    "U1.4-GND": true,
    "U1.5-VCC": true,
    "U1.6-VCC": true,
    "U1.7-VCC": true,
    "U1.8-VCC": true,
    "C1.1-GND": true,
    "C1.2-VCC": true,
    "C2.1-GND": true,
    "C2.2-VCC": true,
    "C3.1-GND": true,
    "C3.2-VCC": true,
    "C4.1-GND": true,
    "C4.2-VCC": true,
  },
  chipGap: 0.5,
  partitionGap: 1,
  decouplingCapsGap: 0.3,
}

test("Decoupling caps are identified and arranged in a vertical column", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)

  const decapGroups =
    solver.identifyDecouplingCapsSolver!.outputDecouplingCapGroups
  expect(decapGroups.length).toBeGreaterThan(0)

  const layout = solver.getOutputLayout()

  for (const group of decapGroups) {
    if (group.decouplingCapChipIds.length < 2) continue

    const placements = group.decouplingCapChipIds.map(
      (id) => layout.chipPlacements[id]!,
    )

    // All caps in a group should share the same x coordinate (column layout)
    const firstX = placements[0]!.x
    for (const p of placements) {
      expect(p.x).toBeCloseTo(firstX, 1)
    }

    // Y coordinates should be strictly increasing (sorted column)
    const ys = placements.map((p) => p.y)
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]!)
    }
  }
})

test("Decoupling cap column uses decouplingCapsGap spacing", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)

  const decapGroups =
    solver.identifyDecouplingCapsSolver!.outputDecouplingCapGroups
  const layout = solver.getOutputLayout()

  for (const group of decapGroups) {
    if (group.decouplingCapChipIds.length < 2) continue

    const placements = group.decouplingCapChipIds
      .map((id) => ({
        id,
        placement: layout.chipPlacements[id]!,
        chip: problem.chipMap[id]!,
      }))
      .sort((a, b) => a.placement.y - b.placement.y)

    // Check spacing between consecutive caps
    for (let i = 1; i < placements.length; i++) {
      const prev = placements[i - 1]!
      const curr = placements[i]!
      const gap =
        curr.placement.y -
        curr.chip.size.y / 2 -
        (prev.placement.y + prev.chip.size.y / 2)
      // Gap should be approximately decouplingCapsGap (0.3)
      expect(gap).toBeCloseTo(0.3, 1)
    }
  }
})
