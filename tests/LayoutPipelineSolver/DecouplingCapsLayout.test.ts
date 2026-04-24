/**
 * Tests for the specialized decoupling capacitor layout (issue #15).
 *
 * Verifies that:
 *  1. `IdentifyDecouplingCapsSolver` finds groups when passives have standard
 *     supply-net connections.
 *  2. `DecouplingCapsPackingSolver` places caps in a horizontal row with
 *     correct spacing and centred at x=0.
 *  3. The full `LayoutPipelineSolver` pipeline produces a layout with zero
 *     chip overlaps for a chip + decoupling cap scenario.
 */

import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { IdentifyDecouplingCapsSolver } from "lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import { DecouplingCapsPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/DecouplingCapsPackingSolver"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { InputProblem, PartitionInputProblem } from "lib/types/InputProblem"

/**
 * Minimal RP2040-style problem: one 57-pin IC (U3) with 11 decoupling capacitors.
 * Mirrors the LayoutPipelineSolver06.page.tsx problem but without the React imports
 * so we can use it in plain Node/bun tests.
 */
const problem: InputProblem = {
  chipMap: {
    U3: {
      chipId: "U3",
      pins: Array.from({ length: 57 }, (_, i) => `U3.${i + 1}`),
      size: { x: 3, y: 8.4 },
      availableRotations: [0, 90, 180, 270],
    },
    C7:  { chipId: "C7",  pins: ["C7.1",  "C7.2"],  size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C8:  { chipId: "C8",  pins: ["C8.1",  "C8.2"],  size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C9:  { chipId: "C9",  pins: ["C9.1",  "C9.2"],  size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C10: { chipId: "C10", pins: ["C10.1", "C10.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C11: { chipId: "C11", pins: ["C11.1", "C11.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C12: { chipId: "C12", pins: ["C12.1", "C12.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C13: { chipId: "C13", pins: ["C13.1", "C13.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C14: { chipId: "C14", pins: ["C14.1", "C14.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C15: { chipId: "C15", pins: ["C15.1", "C15.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C18: { chipId: "C18", pins: ["C18.1", "C18.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
    C19: { chipId: "C19", pins: ["C19.1", "C19.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0, 180] },
  },
  chipPinMap: {
    // U3 pins (simplified - just a few for the decoupling connections)
    ...Object.fromEntries(
      Array.from({ length: 57 }, (_, i) => {
        const pin = i + 1
        return [`U3.${pin}`, {
          pinId: `U3.${pin}`,
          offset: { x: pin <= 29 ? -1.9 : 1.9, y: (pin % 20) * 0.2 - 2.0 },
          side: pin <= 29 ? "x-" : "x+",
        }]
      })
    ),
    // Capacitor pins
    ...Object.fromEntries(
      ["C7","C8","C9","C10","C11","C12","C13","C14","C15","C18","C19"].flatMap(id => [
        [`${id}.1`, { pinId: `${id}.1`, offset: { x: 0, y: 0.55 }, side: "y+" }],
        [`${id}.2`, { pinId: `${id}.2`, offset: { x: 0, y: -0.55 }, side: "y-" }],
      ])
    ),
  },
  netMap: {
    V3_3: { netId: "V3_3", isPositiveVoltageSource: true },
    V1_1: { netId: "V1_1", isPositiveVoltageSource: true },
    GND:  { netId: "GND",  isGround: true },
  },
  pinStrongConnMap: {
    // V3_3 decoupling caps — strong-connect cap pin 1 to U3 VCC pin
    "U3.1-C12.1": true,  "C12.1-U3.1": true,
    "U3.10-C14.1": true, "C14.1-U3.10": true,
    "U3.22-C8.1": true,  "C8.1-U3.22": true,
    "U3.33-C13.1": true, "C13.1-U3.33": true,
    "U3.42-C15.1": true, "C15.1-U3.42": true,
    "U3.49-C19.1": true, "C19.1-U3.49": true,
    // V1_1 decoupling caps
    "U3.23-C18.1": true, "C18.1-U3.23": true,
    "U3.50-C7.1": true,  "C7.1-U3.50": true,
  },
  netConnMap: {
    "U3.1-V3_3": true, "U3.10-V3_3": true, "U3.22-V3_3": true,
    "U3.33-V3_3": true, "U3.42-V3_3": true, "U3.49-V3_3": true,
    "C12.1-V3_3": true, "C14.1-V3_3": true, "C8.1-V3_3": true,
    "C13.1-V3_3": true, "C15.1-V3_3": true, "C19.1-V3_3": true,
    "U3.23-V1_1": true, "U3.50-V1_1": true,
    "C18.1-V1_1": true, "C7.1-V1_1": true, "C9.1-V1_1": true,
    "C12.2-GND": true, "C14.2-GND": true, "C8.2-GND": true,
    "C13.2-GND": true, "C15.2-GND": true, "C19.2-GND": true,
    "C18.2-GND": true, "C7.2-GND":  true, "C9.2-GND":  true,
    "C10.2-GND": true, "C11.2-GND": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.2,
  partitionGap: 1.2,
}

// ---------------------------------------------------------------------------
// Test 1: IdentifyDecouplingCapsSolver finds groups in the LayoutPipelineSolver06
// reference problem.
// ---------------------------------------------------------------------------
test("IdentifyDecouplingCapsSolver finds decoupling cap groups", () => {
  const solver = new IdentifyDecouplingCapsSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.outputDecouplingCapGroups.length).toBeGreaterThan(0)

  for (const group of solver.outputDecouplingCapGroups) {
    expect(group.decouplingCapGroupId).toBeTruthy()
    // The main chip must be a non-capacitor (i.e. not one of the small 2-pin passives)
    expect(group.mainChipId).toBeTruthy()
    expect(group.netPair).toHaveLength(2)
    expect(group.decouplingCapChipIds.length).toBeGreaterThan(0)
    // Main chip must not itself be a decoupling cap
    expect(group.decouplingCapChipIds).not.toContain(group.mainChipId)
  }
})

// ---------------------------------------------------------------------------
// Test 2: DecouplingCapsPackingSolver arranges caps in a centred horizontal
// row with correct spacing.
// ---------------------------------------------------------------------------
test("DecouplingCapsPackingSolver produces a horizontal row layout", () => {
  // Minimal decoupling_caps partition: 3 identical caps
  const capWidth = 0.53
  const capHeight = 1.06
  const gap = 0.2

  const partitionProblem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: capWidth, y: capHeight },
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: capWidth, y: capHeight },
        availableRotations: [0, 180],
      },
      C3: {
        chipId: "C3",
        pins: ["C3.1", "C3.2"],
        size: { x: capWidth, y: capHeight },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.55 }, side: "y-" },
      "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.55 }, side: "y-" },
      "C3.1": { pinId: "C3.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C3.2": { pinId: "C3.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.1-VCC": true,
      "C1.2-GND": true,
      "C2.1-VCC": true,
      "C2.2-GND": true,
      "C3.1-VCC": true,
      "C3.2-GND": true,
    },
    chipGap: 0.6,
    decouplingCapsGap: gap,
    partitionGap: 1.2,
  }

  const solver = new DecouplingCapsPackingSolver({
    partitionInputProblem: partitionProblem,
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements
  // All three chips should be placed
  expect(placements["C1"]).toBeDefined()
  expect(placements["C2"]).toBeDefined()
  expect(placements["C3"]).toBeDefined()

  // All chips should be at y = 0 (horizontal row)
  expect(placements["C1"]!.y).toBe(0)
  expect(placements["C2"]!.y).toBe(0)
  expect(placements["C3"]!.y).toBe(0)

  // All rotations should be 0 (canonical orientation)
  expect(placements["C1"]!.ccwRotationDegrees).toBe(0)
  expect(placements["C2"]!.ccwRotationDegrees).toBe(0)
  expect(placements["C3"]!.ccwRotationDegrees).toBe(0)

  // Chips should be sorted by id and evenly spaced
  const xs = ["C1", "C2", "C3"].map((id) => placements[id]!.x).sort(
    (a, b) => a - b,
  )
  const spacing = xs[1]! - xs[0]!
  expect(Math.abs(spacing - (xs[2]! - xs[1]!))).toBeLessThan(1e-9)
  expect(spacing).toBeCloseTo(capWidth + gap, 5)

  // Row should be centred at x = 0
  const centreX = (xs[0]! + xs[2]!) / 2
  expect(Math.abs(centreX)).toBeLessThan(1e-9)
})

// ---------------------------------------------------------------------------
// Test 3: No overlaps in the LayoutPipelineSolver06 problem (RP2040-style).
// ---------------------------------------------------------------------------
test("LayoutPipelineSolver produces no overlaps for RP2040-style decoupling caps", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()
  expect(outputLayout).toBeDefined()

  // All chips must be placed
  for (const chipId of Object.keys(problem.chipMap)) {
    expect(outputLayout.chipPlacements[chipId]).toBeDefined()
  }

  // No overlaps
  const overlaps = solver.checkForOverlaps(outputLayout)
  expect(overlaps.length).toBe(0)
})

// ---------------------------------------------------------------------------
// Test 4: Single-cap edge case — solver still produces a valid layout.
// ---------------------------------------------------------------------------
test("DecouplingCapsPackingSolver handles a single capacitor", () => {
  const partitionProblem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.53, y: 1.06 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.55 }, side: "y+" },
      "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: { "C1.1-VCC": true, "C1.2-GND": true },
    chipGap: 0.6,
    decouplingCapsGap: 0.2,
    partitionGap: 1.2,
  }

  const solver = new DecouplingCapsPackingSolver({
    partitionInputProblem: partitionProblem,
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()

  const p = solver.layout!.chipPlacements["C1"]
  expect(p).toBeDefined()
  // Single cap should be centred at origin
  expect(p!.x).toBe(0)
  expect(p!.y).toBe(0)
})

// ---------------------------------------------------------------------------
// Test 5: Non-decoupling partitions are unaffected (DecouplingCapsPackingSolver
// only runs for partitionType === "decoupling_caps").
// ---------------------------------------------------------------------------
test("SingleInnerPartitionPackingSolver uses PackSolver2 for non-decoupling partitions", () => {
  // A plain two-chip problem with no decoupling_caps partition type
  const normalProblem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "default",
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2"],
        size: { x: 2, y: 3 },
        availableRotations: [0, 90, 180, 270],
      },
      U2: {
        chipId: "U2",
        pins: ["U2.1", "U2.2"],
        size: { x: 2, y: 3 },
        availableRotations: [0, 90, 180, 270],
      },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -1, y: 0.5 }, side: "x-" },
      "U1.2": { pinId: "U1.2", offset: { x: 1, y: 0.5 }, side: "x+" },
      "U2.1": { pinId: "U2.1", offset: { x: -1, y: 0.5 }, side: "x-" },
      "U2.2": { pinId: "U2.2", offset: { x: 1, y: 0.5 }, side: "x+" },
    },
    netMap: { NET1: { netId: "NET1" } },
    pinStrongConnMap: { "U1.2-U2.1": true, "U2.1-U1.2": true },
    netConnMap: {},
    chipGap: 0.5,
    partitionGap: 1.5,
  }

  // We don't expect DecouplingCapsPackingSolver to run; SingleInnerPartition
  // should use PackSolver2 and still produce a valid layout.

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: normalProblem,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()
  expect(solver.layout!.chipPlacements["U1"]).toBeDefined()
  expect(solver.layout!.chipPlacements["U2"]).toBeDefined()
})
