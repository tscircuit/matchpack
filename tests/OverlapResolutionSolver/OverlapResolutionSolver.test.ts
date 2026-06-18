import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

test("OverlapResolution - pipeline integrates overlap resolution phase", () => {
  // Create a problem with multiple chips that are likely to overlap
  const problem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2", "U1.3", "U1.4"],
        size: { x: 3.0, y: 2.0 },
      },
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 1.0, y: 0.6 },
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 1.0, y: 0.6 },
        availableRotations: [0, 180],
      },
      R1: {
        chipId: "R1",
        pins: ["R1.1", "R1.2"],
        size: { x: 1.0, y: 0.5 },
        availableRotations: [0, 90, 180, 270],
      },
    },
    chipPinMap: {
      "U1.1": {
        pinId: "U1.1",
        offset: { x: -1.5, y: -0.5 },
        side: normalizeSide("left"),
      },
      "U1.2": {
        pinId: "U1.2",
        offset: { x: -1.5, y: 0.5 },
        side: normalizeSide("left"),
      },
      "U1.3": {
        pinId: "U1.3",
        offset: { x: 1.5, y: -0.5 },
        side: normalizeSide("right"),
      },
      "U1.4": {
        pinId: "U1.4",
        offset: { x: 1.5, y: 0.5 },
        side: normalizeSide("right"),
      },
      "C1.1": {
        pinId: "C1.1",
        offset: { x: 0, y: -0.3 },
        side: normalizeSide("top"),
      },
      "C1.2": {
        pinId: "C1.2",
        offset: { x: 0, y: 0.3 },
        side: normalizeSide("bottom"),
      },
      "C2.1": {
        pinId: "C2.1",
        offset: { x: 0, y: -0.3 },
        side: normalizeSide("top"),
      },
      "C2.2": {
        pinId: "C2.2",
        offset: { x: 0, y: 0.3 },
        side: normalizeSide("bottom"),
      },
      "R1.1": {
        pinId: "R1.1",
        offset: { x: -0.5, y: 0 },
        side: normalizeSide("left"),
      },
      "R1.2": {
        pinId: "R1.2",
        offset: { x: 0.5, y: 0 },
        side: normalizeSide("right"),
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {
      "U1.3-R1.1": true,
      "R1.1-U1.3": true,
      "U1.1-C1.1": true,
      "C1.1-U1.1": true,
      "U1.2-C2.1": true,
      "C2.1-U1.2": true,
    },
    netConnMap: {
      "C1.2-GND": true,
      "C2.2-GND": true,
      "U1.4-VCC": true,
      "R1.2-VCC": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  // Verify overlap resolution phase ran
  expect(solver.overlapResolutionSolver).toBeDefined()
  expect(solver.overlapResolutionSolver!.solved).toBe(true)

  // Get the final layout
  const layout = solver.getOutputLayout()
  expect(layout).toBeDefined()

  // All chips should have placements
  expect(layout.chipPlacements["U1"]).toBeDefined()
  expect(layout.chipPlacements["C1"]).toBeDefined()
  expect(layout.chipPlacements["C2"]).toBeDefined()
  expect(layout.chipPlacements["R1"]).toBeDefined()

  // No overlaps in final layout
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)

  // Visualization should work
  const viz = solver.visualize()
  expect(viz).toBeDefined()
  expect(viz.rects).toBeDefined()
  expect(viz.rects!.length).toBeGreaterThan(0)
})

test("OverlapResolution - voltage biasing pushes VCC up and GND down", () => {
  // Create a simple problem with clear voltage connections
  const problem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.vcc", "U1.gnd", "U1.out"],
        size: { x: 2.0, y: 2.0 },
      },
      CVCC: {
        chipId: "CVCC",
        pins: ["CVCC.1", "CVCC.2"],
        size: { x: 1.0, y: 0.6 },
        availableRotations: [0, 180],
      },
      CGND: {
        chipId: "CGND",
        pins: ["CGND.1", "CGND.2"],
        size: { x: 1.0, y: 0.6 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "U1.vcc": {
        pinId: "U1.vcc",
        offset: { x: 0, y: 1.0 },
        side: normalizeSide("top"),
      },
      "U1.gnd": {
        pinId: "U1.gnd",
        offset: { x: 0, y: -1.0 },
        side: normalizeSide("bottom"),
      },
      "U1.out": {
        pinId: "U1.out",
        offset: { x: 1.0, y: 0 },
        side: normalizeSide("right"),
      },
      "CVCC.1": {
        pinId: "CVCC.1",
        offset: { x: 0, y: -0.3 },
        side: normalizeSide("top"),
      },
      "CVCC.2": {
        pinId: "CVCC.2",
        offset: { x: 0, y: 0.3 },
        side: normalizeSide("bottom"),
      },
      "CGND.1": {
        pinId: "CGND.1",
        offset: { x: 0, y: -0.3 },
        side: normalizeSide("top"),
      },
      "CGND.2": {
        pinId: "CGND.2",
        offset: { x: 0, y: 0.3 },
        side: normalizeSide("bottom"),
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {
      "U1.vcc-CVCC.1": true,
      "CVCC.1-U1.vcc": true,
      "U1.gnd-CGND.1": true,
      "CGND.1-U1.gnd": true,
    },
    netConnMap: {
      "U1.vcc-VCC": true,
      "CVCC.1-VCC": true,
      "CVCC.2-GND": true,
      "U1.gnd-GND": true,
      "CGND.1-GND": true,
      "CGND.2-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()

  // No overlaps
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)

  // VCC-connected cap should be above GND-connected cap (higher Y)
  const cvccY = layout.chipPlacements["CVCC"]!.y
  const cgndY = layout.chipPlacements["CGND"]!.y
  expect(cvccY).toBeGreaterThan(cgndY)
})
