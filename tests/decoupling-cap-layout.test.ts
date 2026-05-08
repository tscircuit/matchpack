
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../lib/types/InputProblem"

describe("Decoupling Capacitor Layout", () => {
  it("should create a clean layout for decoupling capacitors", () => {
    // Create a test input problem with decoupling capacitors
    const inputProblem: InputProblem = {
      chipMap: {
        // Main IC
        "ic1": {
          chipId: "ic1",
          pins: ["ic1.p1", "ic1.p2", "ic1.p3", "ic1.p4"],
          size: { x: 10, y: 10 }
        },
        // Decoupling capacitors
        "cap1": {
          chipId: "cap1",
          pins: ["cap1.p1", "cap1.p2"],
          size: { x: 2, y: 1 },
          availableRotations: [0, 180]
        },
        "cap2": {
          chipId: "cap2",
          pins: ["cap2.p1", "cap2.p2"],
          size: { x: 2, y: 1 },
          availableRotations: [0, 180]
        },
        "cap3": {
          chipId: "cap3",
          pins: ["cap3.p1", "cap3.p2"],
          size: { x: 2, y: 1 },
          availableRotations: [0, 180]
        }
      },
      chipPinMap: {
        // IC pins
        "ic1.p1": { pinId: "ic1.p1", offset: { x: -5, y: 0 }, side: "x-" },
        "ic1.p2": { pinId: "ic1.p2", offset: { x: 5, y: 0 }, side: "x+" },
        "ic1.p3": { pinId: "ic1.p3", offset: { x: 0, y: -5 }, side: "y-" },
        "ic1.p4": { pinId: "ic1.p4", offset: { x: 0, y: 5 }, side: "y+" },
        // Capacitor pins
        "cap1.p1": { pinId: "cap1.p1", offset: { x: -1, y: 0 }, side: "x-" },
        "cap1.p2": { pinId: "cap1.p2", offset: { x: 1, y: 0 }, side: "x+" },
        "cap2.p1": { pinId: "cap2.p1", offset: { x: -1, y: 0 }, side: "x-" },
        "cap2.p2": { pinId: "cap2.p2", offset: { x: 1, y: 0 }, side: "x+" },
        "cap3.p1": { pinId: "cap3.p1", offset: { x: -1, y: 0 }, side: "x-" },
        "cap3.p2": { pinId: "cap3.p2", offset: { x: 1, y: 0 }, side: "x+" }
      },
      netMap: {
        "VCC": { netId: "VCC", isPositiveVoltageSource: true },
        "GND": { netId: "GND", isGround: true }
      },
      pinStrongConnMap: {
        // Connect IC power pins to capacitors
        "ic1.p4-cap1.p1": true,
        "ic1.p4-cap2.p1": true,
        "ic1.p4-cap3.p1": true,
        // Connect IC ground pins to capacitors
        "ic1.p3-cap1.p2": true,
        "ic1.p3-cap2.p2": true,
        "ic1.p3-cap3.p2": true
      },
      netConnMap: {
        // Connect capacitors to power and ground nets
        "cap1.p1-VCC": true,
        "cap1.p2-GND": true,
        "cap2.p1-VCC": true,
        "cap2.p2-GND": true,
        "cap3.p1-VCC": true,
        "cap3.p2-GND": true
      },
      chipGap: 1,
      partitionGap: 2,
      decouplingCapsGap: 0.5,
      decouplingCapsLayoutDirection: "horizontal"
    }

    // Create and run the layout solver
    const solver = new LayoutPipelineSolver(inputProblem)
    solver.solve()

    // Get the final layout
    const layout = solver.getOutputLayout()

    // Verify that all capacitors are placed
    expect(layout.chipPlacements["cap1"]).toBeDefined()
    expect(layout.chipPlacements["cap2"]).toBeDefined()
    expect(layout.chipPlacements["cap3"]).toBeDefined()

    // Verify that capacitors are aligned horizontally
    const cap1X = layout.chipPlacements["cap1"].x
    const cap2X = layout.chipPlacements["cap2"].x
    const cap3X = layout.chipPlacements["cap3"].x

    // Capacitors should be placed in a row with consistent spacing
    expect(cap2X).toBeGreaterThan(cap1X)
    expect(cap3X).toBeGreaterThan(cap2X)

    // Verify that all capacitors have the same y position
    const cap1Y = layout.chipPlacements["cap1"].y
    const cap2Y = layout.chipPlacements["cap2"].y
    const cap3Y = layout.chipPlacements["cap3"].y

    expect(cap1Y).toBe(cap2Y)
    expect(cap2Y).toBe(cap3Y)
  })

  it("should support vertical layout for decoupling capacitors", () => {
    // Create a test input problem with decoupling capacitors
    const inputProblem: InputProblem = {
      chipMap: {
        // Main IC
        "ic1": {
          chipId: "ic1",
          pins: ["ic1.p1", "ic1.p2", "ic1.p3", "ic1.p4"],
          size: { x: 10, y: 10 }
        },
        // Decoupling capacitors
        "cap1": {
          chipId: "cap1",
          pins: ["cap1.p1", "cap1.p2"],
          size: { x: 2, y: 1 },
          availableRotations: [0, 180]
        },
        "cap2": {
          chipId: "cap2",
          pins: ["cap2.p1", "cap2.p2"],
          size: { x: 2, y: 1 },
          availableRotations: [0, 180]
        },
        "cap3": {
          chipId: "cap3",
          pins: ["cap3.p1", "cap3.p2"],
          size: { x: 2, y: 1 },
          availableRotations: [0, 180]
        }
      },
      chipPinMap: {
        // IC pins
        "ic1.p1": { pinId: "ic1.p1", offset: { x: -5, y: 0 }, side: "x-" },
        "ic1.p2": { pinId: "ic1.p2", offset: { x: 5, y: 0 }, side: "x+" },
        "ic1.p3": { pinId: "ic1.p3", offset: { x: 0, y: -5 }, side: "y-" },
        "ic1.p4": { pinId: "ic1.p4", offset: { x: 0, y: 5 }, side: "y+" },
        // Capacitor pins
        "cap1.p1": { pinId: "cap1.p1", offset: { x: -1, y: 0 }, side: "x-" },
        "cap1.p2": { pinId: "cap1.p2", offset: { x: 1, y: 0 }, side: "x+" },
        "cap2.p1": { pinId: "cap2.p1", offset: { x: -1, y: 0 }, side: "x-" },
        "cap2.p2": { pinId: "cap2.p2", offset: { x: 1, y: 0 }, side: "x+" },
        "cap3.p1": { pinId: "cap3.p1", offset: { x: -1, y: 0 }, side: "x-" },
        "cap3.p2": { pinId: "cap3.p2", offset: { x: 1, y: 0 }, side: "x+" }
      },
      netMap: {
        "VCC": { netId: "VCC", isPositiveVoltageSource: true },
        "GND": { netId: "GND", isGround: true }
      },
      pinStrongConnMap: {
        // Connect IC power pins to capacitors
        "ic1.p4-cap1.p1": true,
        "ic1.p4-cap2.p1": true,
        "ic1.p4-cap3.p1": true,
        // Connect IC ground pins to capacitors
        "ic1.p3-cap1.p2": true,
        "ic1.p3-cap2.p2": true,
        "ic1.p3-cap3.p2": true
      },
      netConnMap: {
        // Connect capacitors to power and ground nets
        "cap1.p1-VCC": true,
        "cap1.p2-GND": true,
        "cap2.p1-VCC": true,
        "cap2.p2-GND": true,
        "cap3.p1-VCC": true,
        "cap3.p2-GND": true
      },
      chipGap: 1,
      partitionGap: 2,
      decouplingCapsGap: 0.5,
      decouplingCapsLayoutDirection: "vertical"
    }

    // Create and run the layout solver
    const solver = new LayoutPipelineSolver(inputProblem)
    solver.solve()

    // Get the final layout
    const layout = solver.getOutputLayout()

    // Verify that all capacitors are placed
    expect(layout.chipPlacements["cap1"]).toBeDefined()
    expect(layout.chipPlacements["cap2"]).toBeDefined()
    expect(layout.chipPlacements["cap3"]).toBeDefined()

    // Verify that capacitors are aligned vertically
    const cap1Y = layout.chipPlacements["cap1"].y
    const cap2Y = layout.chipPlacements["cap2"].y
    const cap3Y = layout.chipPlacements["cap3"].y

    // Capacitors should be placed in a column with consistent spacing
    expect(cap2Y).toBeGreaterThan(cap1Y)
    expect(cap3Y).toBeGreaterThan(cap2Y)

    // Verify that all capacitors have the same x position
    const cap1X = layout.chipPlacements["cap1"].x
    const cap2X = layout.chipPlacements["cap2"].x
    const cap3X = layout.chipPlacements["cap3"].x

    expect(cap1X).toBe(cap2X)
    expect(cap2X).toBe(cap3X)
  })
})
