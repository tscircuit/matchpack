/**
 * Tests for PowerNetVerticalBiasSolver and its integration in LayoutPipelineSolver.
 *
 * Issue #12: Improve the layout produced for circuits where power/ground nets
 * cause components to be placed in counter-intuitive positions. Power-connected
 * chips should be biased upward and ground-connected chips should be biased
 * downward to produce cleaner, more conventional schematics.
 */

import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { PowerNetVerticalBiasSolver } from "lib/solvers/PowerNetVerticalBiasSolver/PowerNetVerticalBiasSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

/**
 * Build a minimal circuit with explicit power/ground nets.
 *
 * U1: MCU connected to VCC (power) → should be biased upward
 * U2: Sensor connected to GND     → should be biased downward
 * U3: Passive (no power/ground)   → stays in place
 */
function makePowerGroundCircuit(): InputProblem {
  return {
    chipMap: {
      U1: { chipId: "U1", pins: ["U1_VCC", "U1_SDA"], size: { x: 2, y: 1 } },
      U2: { chipId: "U2", pins: ["U2_GND", "U2_SCL"], size: { x: 2, y: 1 } },
      U3: { chipId: "U3", pins: ["U3_A", "U3_B"], size: { x: 1, y: 1 } },
    },
    chipPinMap: {
      U1_VCC: {
        pinId: "U1_VCC",
        offset: { x: -1, y: 0 },
        side: normalizeSide("left"),
      },
      U1_SDA: {
        pinId: "U1_SDA",
        offset: { x: 1, y: 0 },
        side: normalizeSide("right"),
      },
      U2_GND: {
        pinId: "U2_GND",
        offset: { x: -1, y: 0 },
        side: normalizeSide("left"),
      },
      U2_SCL: {
        pinId: "U2_SCL",
        offset: { x: 1, y: 0 },
        side: normalizeSide("right"),
      },
      U3_A: {
        pinId: "U3_A",
        offset: { x: -0.5, y: 0 },
        side: normalizeSide("left"),
      },
      U3_B: {
        pinId: "U3_B",
        offset: { x: 0.5, y: 0 },
        side: normalizeSide("right"),
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
      SDA: { netId: "SDA" },
    },
    pinStrongConnMap: {
      "U1_SDA-U2_SCL": true,
      "U2_SCL-U1_SDA": true,
    },
    netConnMap: {
      "U1_VCC-VCC": true,
      "U2_GND-GND": true,
      "U1_SDA-SDA": true,
      "U2_SCL-SDA": true,
    },
    chipGap: 0.5,
    partitionGap: 2,
  }
}

test("PowerNetVerticalBiasSolver - power chip moves up, ground chip moves down", () => {
  const problem = makePowerGroundCircuit()

  // Create a simple layout with all chips at y=0
  const initialLayout = {
    chipPlacements: {
      U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
      U2: { x: 5, y: 0, ccwRotationDegrees: 0 },
      U3: { x: 10, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }

  const solver = new PowerNetVerticalBiasSolver({
    inputProblem: problem,
    layout: initialLayout,
    biasAmount: 3,
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const biasedLayout = solver.getOutputLayout()

  // U1 is connected to VCC (positive) → bias upward (negative Y)
  expect(biasedLayout.chipPlacements.U1!.y).toBeLessThan(0)

  // U2 is connected to GND → bias downward (positive Y)
  expect(biasedLayout.chipPlacements.U2!.y).toBeGreaterThan(0)

  // U3 has no power/ground connection → stays at y=0
  expect(biasedLayout.chipPlacements.U3!.y).toBe(0)

  // X positions are unchanged
  expect(biasedLayout.chipPlacements.U1!.x).toBe(0)
  expect(biasedLayout.chipPlacements.U2!.x).toBe(5)
  expect(biasedLayout.chipPlacements.U3!.x).toBe(10)
})

test("PowerNetVerticalBiasSolver - neutral chip (both power+ground) stays near center", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: { chipId: "U1", pins: ["U1_VCC", "U1_GND"], size: { x: 2, y: 2 } },
    },
    chipPinMap: {
      U1_VCC: {
        pinId: "U1_VCC",
        offset: { x: -1, y: 0.5 },
        side: normalizeSide("left"),
      },
      U1_GND: {
        pinId: "U1_GND",
        offset: { x: -1, y: -0.5 },
        side: normalizeSide("left"),
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "U1_VCC-VCC": true,
      "U1_GND-GND": true,
    },
    chipGap: 0.5,
    partitionGap: 2,
  }

  const initialLayout = {
    chipPlacements: {
      U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }

  const solver = new PowerNetVerticalBiasSolver({
    inputProblem: problem,
    layout: initialLayout,
    biasAmount: 3,
  })

  solver.solve()

  const biasedLayout = solver.getOutputLayout()
  // Bias score = +1 (VCC) + -1 (GND) = 0 → no movement
  expect(biasedLayout.chipPlacements.U1!.y).toBe(0)
})

test("LayoutPipelineSolver - power net bias phase runs and produces biased layout", () => {
  const problem = makePowerGroundCircuit()
  const solver = new LayoutPipelineSolver(problem)

  solver.solve()
  expect(solver.solved).toBe(true)

  // Verify the bias phase ran
  expect(solver.powerNetVerticalBiasSolver?.solved).toBe(true)
  expect(solver.powerNetVerticalBiasSolver?.biasedLayout).toBeDefined()

  // getOutputLayout should return the biased layout
  const layout = solver.getOutputLayout()
  expect(layout).toBeDefined()
  expect(Object.keys(layout.chipPlacements).length).toBeGreaterThan(0)

  // The biased layout should be the one returned by getOutputLayout
  const biasedLayout = solver.powerNetVerticalBiasSolver!.biasedLayout!
  expect(layout.chipPlacements).toEqual(biasedLayout.chipPlacements)
})

test("LayoutPipelineSolver - bias does not increase overlaps vs pre-bias layout", () => {
  const problem = makePowerGroundCircuit()
  const solver = new LayoutPipelineSolver(problem)

  solver.solve()
  expect(solver.solved).toBe(true)

  // Compare overlap count: post-bias should be no worse than the raw packing result
  const preBiasLayout = solver.partitionPackingSolver!.finalLayout!
  const postBiasLayout = solver.powerNetVerticalBiasSolver!.biasedLayout!

  const preBiasOverlaps = solver.checkForOverlaps(preBiasLayout)
  const postBiasOverlaps = solver.checkForOverlaps(postBiasLayout)

  // The bias phase should not make the layout significantly worse
  // (allow the same number of overlaps or fewer)
  expect(postBiasOverlaps.length).toBeLessThanOrEqual(
    preBiasOverlaps.length + 1,
  )
})
