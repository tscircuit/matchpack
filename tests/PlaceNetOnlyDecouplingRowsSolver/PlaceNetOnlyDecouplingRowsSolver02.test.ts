import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { canLayoutDecouplingCapRow } from "lib/solvers/PackInnerPartitionsSolver/DecouplingCapRowSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { getVerticalPinClearanceOffset } from "lib/utils/getVerticalPinClearanceOffset"

test("anchors a decoupling capacitor row to a single fixed-position capacitor", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.vcc", "U1.gnd"],
        size: { x: 2, y: 2 },
        fixedPosition: { x: 0, y: 0 },
        availableRotations: [0],
      },
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        fixedPosition: { x: -4, y: 2 },
        availableRotations: [0],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
      C3: {
        chipId: "C3",
        pins: ["C3.1", "C3.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "U1.vcc": {
        pinId: "U1.vcc",
        offset: { x: -1, y: 0.5 },
        side: "x-",
      },
      "U1.gnd": {
        pinId: "U1.gnd",
        offset: { x: -1, y: -0.5 },
        side: "x-",
      },
      "C1.1": {
        pinId: "C1.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C1.2": {
        pinId: "C1.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
      "C2.1": {
        pinId: "C2.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C2.2": {
        pinId: "C2.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
      "C3.1": {
        pinId: "C3.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C3.2": {
        pinId: "C3.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "U1.vcc-VCC": true,
      "U1.gnd-GND": true,
      "C1.1-VCC": true,
      "C1.2-GND": true,
      "C2.1-VCC": true,
      "C2.2-GND": true,
      "C3.1-VCC": true,
      "C3.2-GND": true,
    },
    chipGap: 0.6,
    decouplingCapsGap: 0.4,
    partitionGap: 1.2,
  }

  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  const decouplingPartition = solver.chipPartitionsSolver?.partitions.find(
    (partition) => partition.partitionType === "decoupling_caps",
  )
  expect(decouplingPartition).toBeDefined()
  expect(canLayoutDecouplingCapRow(decouplingPartition!)).toBe(true)

  const layout = solver.getOutputLayout()
  const c1 = layout.chipPlacements.C1!
  const c2 = layout.chipPlacements.C2!
  const c3 = layout.chipPlacements.C3!

  expect(c1.x).toBeCloseTo(-4, 5)
  expect(c1.y).toBeCloseTo(2, 5)
  expect(c2.y).toBeCloseTo(c1.y, 5)
  expect(c3.y).toBeCloseTo(c1.y, 5)
  expect(Math.abs(c1.x - c2.x)).toBeCloseTo(0.9 + 0.4, 5)
  expect(Math.abs(c2.x - c3.x)).toBeCloseTo(0.9 + 0.4, 5)
  expect(solver.checkForOverlaps(layout)).toEqual([])
})

test("aligns multiple net-only decoupling rows on the same chip side to their respective rail pins", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.v33", "U1.v11", "U1.gnd"],
        size: { x: 2.4, y: 5 },
        availableRotations: [0],
      },
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
      C3: {
        chipId: "C3",
        pins: ["C3.1", "C3.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
      C4: {
        chipId: "C4",
        pins: ["C4.1", "C4.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "U1.v33": {
        pinId: "U1.v33",
        offset: { x: -1.2, y: 1.8 },
        side: "x-",
      },
      "U1.v11": {
        pinId: "U1.v11",
        offset: { x: -1.2, y: -1.8 },
        side: "x-",
      },
      "U1.gnd": {
        pinId: "U1.gnd",
        offset: { x: 1.2, y: 0 },
        side: "x+",
      },
      "C1.1": {
        pinId: "C1.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C1.2": {
        pinId: "C1.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
      "C2.1": {
        pinId: "C2.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C2.2": {
        pinId: "C2.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
      "C3.1": {
        pinId: "C3.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C3.2": {
        pinId: "C3.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
      "C4.1": {
        pinId: "C4.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C4.2": {
        pinId: "C4.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
    },
    netMap: {
      V3_3: { netId: "V3_3", isPositiveVoltageSource: true },
      V1_1: { netId: "V1_1", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "U1.v33-V3_3": true,
      "U1.v11-V1_1": true,
      "U1.gnd-GND": true,
      "C1.1-V3_3": true,
      "C1.2-GND": true,
      "C2.1-V3_3": true,
      "C2.2-GND": true,
      "C3.1-V1_1": true,
      "C3.2-GND": true,
      "C4.1-V1_1": true,
      "C4.2-GND": true,
    },
    chipGap: 0.6,
    decouplingCapsGap: 0.4,
    partitionGap: 1.2,
  }

  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const u1 = layout.chipPlacements.U1!
  const c1 = layout.chipPlacements.C1!
  const c3 = layout.chipPlacements.C3!

  const expectedV33RowY =
    u1.y +
    getVerticalPinClearanceOffset({
      upperPin: inputProblem.chipPinMap["U1.v33"]!,
      upperPlacement: u1,
      lowerPin: inputProblem.chipPinMap["C1.1"]!,
      lowerPlacement: { ...c1, y: u1.y },
    })
  const expectedV11RowY =
    u1.y +
    getVerticalPinClearanceOffset({
      upperPin: inputProblem.chipPinMap["U1.v11"]!,
      upperPlacement: u1,
      lowerPin: inputProblem.chipPinMap["C3.1"]!,
      lowerPlacement: { ...c3, y: u1.y },
    })

  expect(c1.y).toBeCloseTo(expectedV33RowY, 5)
  expect(layout.chipPlacements.C2!.y).toBeCloseTo(expectedV33RowY, 5)
  expect(c3.y).toBeCloseTo(expectedV11RowY, 5)
  expect(layout.chipPlacements.C4!.y).toBeCloseTo(expectedV11RowY, 5)
  expect(solver.checkForOverlaps(layout)).toEqual([])
})

test("places a net-only decoupling row on a vertical main chip side aligned to the rail pin", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.vcc", "U1.gnd"],
        size: { x: 4, y: 2 },
        availableRotations: [0],
      },
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.9, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "U1.vcc": {
        pinId: "U1.vcc",
        offset: { x: -1.4, y: 1 },
        side: "y+",
      },
      "U1.gnd": {
        pinId: "U1.gnd",
        offset: { x: 1.4, y: -1 },
        side: "y-",
      },
      "C1.1": {
        pinId: "C1.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C1.2": {
        pinId: "C1.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
      "C2.1": {
        pinId: "C2.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C2.2": {
        pinId: "C2.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "U1.vcc-VCC": true,
      "U1.gnd-GND": true,
      "C1.1-VCC": true,
      "C1.2-GND": true,
      "C2.1-VCC": true,
      "C2.2-GND": true,
    },
    chipGap: 0.6,
    decouplingCapsGap: 0.4,
    partitionGap: 1.2,
  }

  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const u1 = layout.chipPlacements.U1!
  const c1 = layout.chipPlacements.C1!
  const c2 = layout.chipPlacements.C2!

  const mainPinX = u1.x + inputProblem.chipPinMap["U1.vcc"]!.offset.x
  const rowBottomY = Math.min(c1.y - 0.3, c2.y - 0.3)
  const mainTopY = u1.y + 1

  expect(c1.x).toBeCloseTo(mainPinX, 5)
  expect(rowBottomY - mainTopY).toBeCloseTo(inputProblem.partitionGap, 5)
  expect(solver.checkForOverlaps(layout)).toEqual([])
})
