import { describe, expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"

describe("PlaceChipConnectedDecouplingCapsSolver 4-directional support", () => {
  test("supports decoupling capacitors on top side (y+)", () => {
    // Construct an input problem with an MCU U1 and two decoupling capacitors C1, C2 on the top side (y+)
    const problem: InputProblem = {
      chipMap: {
        U1: {
          chipId: "U1",
          pins: ["U1.1", "U1.2", "U1.3"],
          size: { x: 4, y: 4 },
          availableRotations: [0],
        },
        C1: {
          chipId: "C1",
          pins: ["C1.1", "C1.2"],
          size: { x: 1, y: 1 },
          availableRotations: [0],
          isCapacitor: true,
        },
        C2: {
          chipId: "C2",
          pins: ["C2.1", "C2.2"],
          size: { x: 1, y: 1 },
          availableRotations: [0],
          isCapacitor: true,
        },
      },
      chipPinMap: {
        "U1.1": { pinId: "U1.1", side: "y+", offset: { x: -0.5, y: 2 } },
        "U1.2": { pinId: "U1.2", side: "y+", offset: { x: 0.5, y: 2 } },
        "U1.3": { pinId: "U1.3", side: "y-", offset: { x: 0, y: -2 } },
        "C1.1": { pinId: "C1.1", side: "y-", offset: { x: 0, y: -0.5 } },
        "C1.2": { pinId: "C1.2", side: "y+", offset: { x: 0, y: 0.5 } },
        "C2.1": { pinId: "C2.1", side: "y-", offset: { x: 0, y: -0.5 } },
        "C2.2": { pinId: "C2.2", side: "y+", offset: { x: 0, y: 0.5 } },
      },
      netMap: {
        VCC: { netId: "VCC", isPositiveVoltageSource: true },
        GND: { netId: "GND", isGround: true },
      },
      netConnMap: {
        "U1.1-VCC": true,
        "U1.2-VCC": true,
        "U1.3-GND": true,
        "C1.1-VCC": true,
        "C1.2-GND": true,
        "C2.1-VCC": true,
        "C2.2-GND": true,
      },
      pinStrongConnMap: {
        "U1.1-C1.1": true,
        "C1.1-U1.1": true,
        "U1.2-C2.1": true,
        "C2.1-U1.2": true,
      },
      chipGap: 0.5,
      partitionGap: 0.5,
    }

    const solver = new LayoutPipelineSolver(problem)
    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)

    const layout = solver.getOutputLayout()
    const u1Placement = layout.chipPlacements["U1"]!
    const c1Placement = layout.chipPlacements["C1"]!
    const c2Placement = layout.chipPlacements["C2"]!

    // Caps should be placed on the y+ side (above U1)
    expect(c1Placement.y).toBeGreaterThan(u1Placement.y)
    expect(c2Placement.y).toBeGreaterThan(u1Placement.y)
  })

  test("supports decoupling capacitors on bottom side (y-)", () => {
    const problem: InputProblem = {
      chipMap: {
        U1: {
          chipId: "U1",
          pins: ["U1.1", "U1.2", "U1.3"],
          size: { x: 4, y: 4 },
          availableRotations: [0],
        },
        C1: {
          chipId: "C1",
          pins: ["C1.1", "C1.2"],
          size: { x: 1, y: 1 },
          availableRotations: [0],
          isCapacitor: true,
        },
        C2: {
          chipId: "C2",
          pins: ["C2.1", "C2.2"],
          size: { x: 1, y: 1 },
          availableRotations: [0],
          isCapacitor: true,
        },
      },
      chipPinMap: {
        "U1.1": { pinId: "U1.1", side: "y-", offset: { x: -0.5, y: -2 } },
        "U1.2": { pinId: "U1.2", side: "y-", offset: { x: 0.5, y: -2 } },
        "U1.3": { pinId: "U1.3", side: "y+", offset: { x: 0, y: 2 } },
        "C1.1": { pinId: "C1.1", side: "y+", offset: { x: 0, y: 0.5 } },
        "C1.2": { pinId: "C1.2", side: "y-", offset: { x: 0, y: -0.5 } },
        "C2.1": { pinId: "C2.1", side: "y+", offset: { x: 0, y: 0.5 } },
        "C2.2": { pinId: "C2.2", side: "y-", offset: { x: 0, y: -0.5 } },
      },
      netMap: {
        VCC: { netId: "VCC", isPositiveVoltageSource: true },
        GND: { netId: "GND", isGround: true },
      },
      netConnMap: {
        "U1.1-VCC": true,
        "U1.2-VCC": true,
        "U1.3-GND": true,
        "C1.1-VCC": true,
        "C1.2-GND": true,
        "C2.1-VCC": true,
        "C2.2-GND": true,
      },
      pinStrongConnMap: {
        "U1.1-C1.1": true,
        "C1.1-U1.1": true,
        "U1.2-C2.1": true,
        "C2.1-U1.2": true,
      },
      chipGap: 0.5,
      partitionGap: 0.5,
    }

    const solver = new LayoutPipelineSolver(problem)
    solver.solve()

    expect(solver.solved).toBe(true)
    const layout = solver.getOutputLayout()
    const u1Placement = layout.chipPlacements["U1"]!
    const c1Placement = layout.chipPlacements["C1"]!
    const c2Placement = layout.chipPlacements["C2"]!

    // Caps should be placed on the y- side (below U1)
    expect(c1Placement.y).toBeLessThan(u1Placement.y)
    expect(c2Placement.y).toBeLessThan(u1Placement.y)
  })

  test("supports decoupling capacitors on right side (x+)", () => {
    const problem: InputProblem = {
      chipMap: {
        U1: {
          chipId: "U1",
          pins: ["U1.1", "U1.2", "U1.3"],
          size: { x: 4, y: 4 },
          availableRotations: [0],
        },
        C1: {
          chipId: "C1",
          pins: ["C1.1", "C1.2"],
          size: { x: 1, y: 1 },
          availableRotations: [0],
          isCapacitor: true,
        },
        C2: {
          chipId: "C2",
          pins: ["C2.1", "C2.2"],
          size: { x: 1, y: 1 },
          availableRotations: [0],
          isCapacitor: true,
        },
      },
      chipPinMap: {
        "U1.1": { pinId: "U1.1", side: "x+", offset: { x: 2, y: -0.5 } },
        "U1.2": { pinId: "U1.2", side: "x+", offset: { x: 2, y: 0.5 } },
        "U1.3": { pinId: "U1.3", side: "x-", offset: { x: -2, y: 0 } },
        "C1.1": { pinId: "C1.1", side: "y-", offset: { x: 0, y: -0.5 } },
        "C1.2": { pinId: "C1.2", side: "y+", offset: { x: 0, y: 0.5 } },
        "C2.1": { pinId: "C2.1", side: "y-", offset: { x: 0, y: -0.5 } },
        "C2.2": { pinId: "C2.2", side: "y+", offset: { x: 0, y: 0.5 } },
      },
      netMap: {
        VCC: { netId: "VCC", isPositiveVoltageSource: true },
        GND: { netId: "GND", isGround: true },
      },
      netConnMap: {
        "U1.1-VCC": true,
        "U1.2-VCC": true,
        "U1.3-GND": true,
        "C1.1-VCC": true,
        "C1.2-GND": true,
        "C2.1-VCC": true,
        "C2.2-GND": true,
      },
      pinStrongConnMap: {
        "U1.1-C1.1": true,
        "C1.1-U1.1": true,
        "U1.2-C2.1": true,
        "C2.1-U1.2": true,
      },
      chipGap: 0.5,
      partitionGap: 0.5,
    }

    const solver = new LayoutPipelineSolver(problem)
    solver.solve()

    expect(solver.solved).toBe(true)
    const layout = solver.getOutputLayout()
    const u1Placement = layout.chipPlacements["U1"]!
    const c1Placement = layout.chipPlacements["C1"]!
    const c2Placement = layout.chipPlacements["C2"]!

    // Caps should be placed on the x+ side (right of U1)
    expect(c1Placement.x).toBeGreaterThan(u1Placement.x)
    expect(c2Placement.x).toBeGreaterThan(u1Placement.x)
  })

  test("preserves fixedPosition decoupling capacitors without displacement", () => {
    const problem: InputProblem = {
      chipMap: {
        U1: {
          chipId: "U1",
          pins: ["U1.1", "U1.2"],
          size: { x: 4, y: 4 },
          availableRotations: [0],
        },
        C1: {
          chipId: "C1",
          pins: ["C1.1", "C1.2"],
          size: { x: 1, y: 1 },
          availableRotations: [0],
          isCapacitor: true,
          fixedPosition: { x: -10, y: 5 },
        },
        C2: {
          chipId: "C2",
          pins: ["C2.1", "C2.2"],
          size: { x: 1, y: 1 },
          availableRotations: [0],
          isCapacitor: true,
        },
      },
      chipPinMap: {
        "U1.1": { pinId: "U1.1", side: "x-", offset: { x: -2, y: 0.5 } },
        "U1.2": { pinId: "U1.2", side: "x-", offset: { x: -2, y: -0.5 } },
        "C1.1": { pinId: "C1.1", side: "y-", offset: { x: 0, y: -0.5 } },
        "C1.2": { pinId: "C1.2", side: "y+", offset: { x: 0, y: 0.5 } },
        "C2.1": { pinId: "C2.1", side: "y-", offset: { x: 0, y: -0.5 } },
        "C2.2": { pinId: "C2.2", side: "y+", offset: { x: 0, y: 0.5 } },
      },
      netMap: {
        VCC: { netId: "VCC", isPositiveVoltageSource: true },
        GND: { netId: "GND", isGround: true },
      },
      netConnMap: {
        "U1.1-VCC": true,
        "U1.2-GND": true,
        "C1.1-VCC": true,
        "C1.2-GND": true,
        "C2.1-VCC": true,
        "C2.2-GND": true,
      },
      pinStrongConnMap: {
        "U1.1-C1.1": true,
        "C1.1-U1.1": true,
      },
      chipGap: 0.5,
      partitionGap: 0.5,
    }

    const solver = new LayoutPipelineSolver(problem)
    solver.solve()

    expect(solver.solved).toBe(true)
    const layout = solver.getOutputLayout()
    expect(layout.chipPlacements["C1"]!.x).toBe(-10)
    expect(layout.chipPlacements["C1"]!.y).toBe(5)
  })
})
